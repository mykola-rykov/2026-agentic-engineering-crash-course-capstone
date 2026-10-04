"""Extract published reference numbers; imports no application/model code.

Requires xlrd==2.0.2, only for maintainer regeneration of the checked fixture.
"""
import hashlib
import io
import json
import math
from pathlib import Path
import sys
from zipfile import ZipFile
import xlrd

SOURCE = 'https://www.itu.int/en/ITU-R/study-groups/rsg3/rwp3m/Validation%20Example/Validation%20examples%20for%20the%20delta%20Bullington%20diffraction%20prediction%20method.docx'

def extract(source, output):
    document = Path(source).read_bytes()
    with ZipFile(io.BytesIO(document)) as archive:
        names = [n for n in archive.namelist() if n.startswith('word/embeddings/') and n.endswith('.xls')]
        if len(names) != 1:
            raise ValueError('Expected one embedded reference workbook.')
        workbook_data = archive.read(names[0])
    book = xlrd.open_workbook(file_contents=workbook_data)
    profiles = {}
    for number in range(1, 5):
        sheet = book.sheet_by_name(f'Path {number}')
        values = [[sheet.cell_value(row, 0) * 1000, sheet.cell_value(row, 1)] for row in range(1, sheet.nrows)]
        if values[0][0] != 0 or any(not math.isfinite(x) for pair in values for x in pair) or any(values[i][0] <= values[i - 1][0] for i in range(1, len(values))):
            raise ValueError('Invalid source profile.')
        profiles[str(number)] = values
    sheet = book.sheet_by_name('outputs')
    cases = []
    for row in range(2, sheet.nrows):
        values = sheet.row_values(row)
        cases.append({'profileId': str(int(values[0])), 'transmitterAboveTerrainM': values[1], 'receiverAboveTerrainM': values[2], 'frequencyHz': values[3] * 1e6, 'expected': {'modifiedTransmitterHeightM': values[4], 'modifiedReceiverHeightM': values[5], 'actualBullingtonLossDb': values[12], 'smoothBullingtonLossDb': values[13], 'sphericalLossDb': values[14], 'deltaBullingtonLossDb': values[15]}})
    if len(cases) != 20:
        raise ValueError('Expected twenty independent published cases.')
    result = {'schemaVersion': 1, 'sourceUrl': SOURCE, 'documentSha256': hashlib.sha256(document).hexdigest(), 'workbookSha256': hashlib.sha256(workbook_data).hexdigest(), 'methodEdition': 'ITU-R P.526-15', 'referenceEffectiveEarthRadiusM': 8_500_000, 'referenceSpeedOfLightMps': 300_000_000, 'lossToleranceDb': .001, 'profiles': profiles, 'cases': cases}
    Path(output).write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(f'Extracted {len(cases)} published cases and {len(profiles)} profiles without invoking the application.')

if __name__ == '__main__':
    extract(sys.argv[1], sys.argv[2])
