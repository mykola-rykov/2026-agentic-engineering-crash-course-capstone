# Pinned RF numerical references

Model identity: `p525-p526-delta-bullington`, version `1`. Editions are immutable inputs, independent of which recommendations are currently in force.

| Calculation | Edition / equation references | Units at boundary |
| --- | --- | --- |
| Free-space | [ITU-R P.525-5 (November 2024)](https://www.itu.int/rec/R-REC-P.525-5-202411-I/en), Annex §2.3, equation 5 | distance m, wavelength m, loss dB |
| Knife edge | [ITU-R P.526-15 (October 2019)](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.526-15-201910-S!!PDF-E.pdf), equation 31 | dimensionless diffraction parameter, dB |
| Actual/smooth Bullington | P.526-15 §4.5.1, equations 49–57 | profile distances km, heights m, curvature 1/km |
| Smooth-surface fitting | P.526-15 §4.5.2, equations 58–65 | distances km, heights m |
| Spherical diffraction | P.526-15 §§3.1.1.2/3.2, equations 13–18 and 21–25 | self-consistent SI internally |
| Delta combination | P.526-15 equation 66 | L = Lactual + max(Lsphere − Lsmooth, 0), dB |

## Application numerical policy

Free-space uses equation 5 with c = 299,792,458 m/s. The rounded 32.4 constant in equation 6 is a display-level approximation, not the implementation reference. Validate frequency in 100 MHz–6 GHz and require positive path length. Coincident station/aircraft points cannot be evaluated by a far-field path-loss formula.

The diffraction kernel defaults to effective radius (4/3) × 6,371,000 m. Curvature is applied once inside the model, with an independent curved-profile copy for Fresnel evidence. Endpoint heights are absolute values in one datum. Profile distances must increase strictly. Missing samples prevent an RF feasibility claim. No terrain elevation is silently zero-filled.

Use the scalar spherical approximation β = 1; configured polarization mismatch is a separate explicit link loss. This approximation does not model surface-dependent vertical-polarization ground impedance. Record it in results. Wavelength for application calculations uses exact c; reference fixtures explicitly override c/radius to the source's rounded constants. Do not change expected values to match the application defaults.

## Independent evidence

[ITU's published validation catalog](https://www.itu.int/en/ITU-R/study-groups/rsg3/rwp3m/Pages/digprod.aspx) links a public Word document containing an Excel workbook. `tests/fixtures/rf/itu-delta-bullington.json` extracts its four terrain profiles and all 20 cases. Expected actual Bullington, smooth Bullington, spherical and final losses, and modified antenna heights come directly from workbook cells. The workbook's descriptions explicitly reference P.526-15 equations. Source/document/workbook SHA-256 values accompany the fixture. The reference radius is 8,500,000 m and c is 300,000,000 m/s; the radius is also independently confirmed by reproducing the published normalized X value for Path 1 (4.364083873300201).

Regeneration uses no application code:

```sh
python3 -m pip install --no-cache-dir --target .cache/rf-references/python xlrd==2.0.2
curl --fail --location --output .cache/rf-references/delta-bullington.docx 'https://www.itu.int/en/ITU-R/study-groups/rsg3/rwp3m/Validation%20Example/Validation%20examples%20for%20the%20delta%20Bullington%20diffraction%20prediction%20method.docx'
PYTHONPATH=.cache/rf-references/python python3 tools/rf/extract_itu_reference.py .cache/rf-references/delta-bullington.docx tests/fixtures/rf/itu-delta-bullington.json
```

Published multi-obstruction paths exercise rough terrain and smooth-earth corrections. `analytical-single-ridge.json` is a separate hand calculation for a 1 km path, 100 m terminals, and a 150 m midpoint ridge at 1 GHz. With the reference constants, midpoint excess = 50 + 1000²/(8 × 8500000) m, ν = 8.167367269809402, J = 31.088410831468067 dB, and corrected Bullington = 41.0520972032907 dB. Smooth/spherical losses are zero for the high-terminal short path. This calculation was recorded before application propagation code exists.

Acceptance tolerances: published losses 0.001 dB, modified heights 0.000001 m; hand single-ridge loss 0.000001 dB; analytical free-space 0.000000001 dB. Additional boundary tests must exercise LoS/trans-horizon, zero clearance, negative elevations and invalid profiles. Tolerances represent numerical agreement, not measured field accuracy. These artifacts establish references; the propagation kernel now passes all 20 published cases and the hand single-ridge fixture in `tests/propagation.test.ts`.

## Antenna and directional budget conventions

World directions use east/north/up. Heading is clockwise from north; pitch is nose-up; positive bank lowers the right wing. Apply the inverse platform frame followed by the inverse mounting frame. Local pattern azimuth is clockwise from forward and elevation is toward up. Ground pointing stays fixed in world coordinates; return-flight heading is independent. Gains are assumed reciprocal at the single configured frequency.

Sampled patterns interpolate dBi linearly on a periodic azimuth/elevation triangulation. A single elevation ring supports that elevation only. No elevation extrapolation is permitted; unsupported directions make RF indeterminate. Duplicate angular samples are rejected. Illustrative patterns are not measured radiation data.

Cable, installation and polarization losses are explicit end-to-end values for each direction. Polarization type alone cannot determine mismatch without axial ratio/orientation data; users supply the directional mismatch loss, including any attitude assumptions. The application never fabricates a finite loss for ideal opposite circular polarization. Those supplied losses and the RF allowance remain distinct from propagation and Fresnel evidence.

Received power = transmit power + transmit gain + receive gain − free-space − diffraction − cable − installation − polarization loss. Available margin = received power − receiver sensitivity − RF allowance. Compare the smaller directional margin against the mission requirement. Terrain uncertainty changes the obstruction envelope before diffraction; the separate RF allowance is subtracted once in each directional budget. Missing propagation or pattern support prevents confident feasibility.
