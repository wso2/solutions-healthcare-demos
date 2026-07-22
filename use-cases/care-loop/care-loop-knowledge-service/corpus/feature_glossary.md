# Care Loop heart-risk feature glossary

Plain definitions of the 11 features from the Kaggle heart-failure dataset that the Care Loop
heart-risk model scores. `Age`, `Sex`, and `MaxHR` are always available from the wearable and
HealthKit profile and are the features the currently deployed model uses; the rest are prefilled
from the patient's FHIR record or gathered during the check-in chat when available.

## Age
The patient's age in years. Used by the deployed model.

## Sex
Biological sex, recorded as `M` (male) or `F` (female). Used by the deployed model.

## MaxHR
Maximum heart rate achieved, in beats per minute, from the wearable heart-rate sensor. Used by the
deployed model.

## ChestPainType
The category of chest pain the patient reports, by the classic angina criteria: substernal chest
discomfort, provoked by exertion, and relieved by rest or nitroglycerin.

- `TA` (typical angina): all three criteria present.
- `ATA` (atypical angina): two of the three.
- `NAP` (non-anginal pain): one or none.
- `ASY` (asymptomatic): no chest pain reported.

## RestingBP
Resting systolic blood pressure, in mmHg. In the raw dataset a value of 0 means the measurement was
missing.

## Cholesterol
Serum total cholesterol, in mg/dL. In the raw dataset a value of 0 means the measurement was missing.

## FastingBS
Whether fasting blood sugar is above 120 mg/dL: `1` if greater than 120 mg/dL, else `0`. Care Loop
also infers `1` from an active diabetes condition when no fasting glucose lab is on file.

## RestingECG
The resting electrocardiogram result: `Normal`; `ST` (ST-T wave abnormality, such as T-wave
inversions or ST elevation/depression); or `LVH` (probable or definite left ventricular hypertrophy).

## ExerciseAngina
Whether physical exertion brings on chest discomfort: `Y` or `N`. Care Loop derives this from the
patient's chest-pain answers rather than asking separately when possible.

## Oldpeak
ST-segment depression induced by exercise relative to rest, from a stress test. Higher values
indicate more exercise-induced ischemia. Care Loop only prefills this from prior cardiology data; it
is never asked of the patient.

## ST_Slope
The slope of the peak exercise ST segment: `Up` (upsloping), `Flat`, or `Down` (downsloping). Flat
and downsloping segments are more concerning for ischemia. Prefilled from prior data only; never
asked of the patient.
