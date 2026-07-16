"""Static definitions of the 11 Kaggle heart-failure features.

This is a plain dict lookup with no embeddings: the deployed model consumes
``Age``, ``Sex`` and ``MaxHR``; the remaining eight are dataset fields the
service accepts as optional context. ``get_feature_definition`` resolves a name
by exact match first, then a case-insensitive / alias fallback.
"""

from app.schemas import FeatureDefinition

_USED = "used by the deployed model"
_OPTIONAL = "dataset field; optional feature"

FEATURE_DEFINITIONS: dict[str, FeatureDefinition] = {
    "Age": FeatureDefinition(
        feature="Age",
        definition="The patient's age in years, derived from the HealthKit date-of-birth characteristic.",
        values="Integer years, typically 28-77 in the training data.",
        model_usage=_USED,
    ),
    "Sex": FeatureDefinition(
        feature="Sex",
        definition="Biological sex recorded as a HealthKit characteristic.",
        values="M (male) or F (female).",
        model_usage=_USED,
    ),
    "MaxHR": FeatureDefinition(
        feature="MaxHR",
        definition="Maximum heart rate achieved, read from the wearable heart-rate sensor.",
        values="Beats per minute, typically 60-202 in the training data.",
        model_usage=_USED,
    ),
    "ChestPainType": FeatureDefinition(
        feature="ChestPainType",
        definition=(
            "The category of chest pain the patient reports. TA (typical angina) is substernal pain "
            "provoked by exertion and relieved by rest or nitroglycerin; ATA (atypical angina) meets "
            "two of those three criteria; NAP (non-anginal pain) meets one or none; ASY (asymptomatic) "
            "means no chest pain is reported."
        ),
        values="TA (typical angina), ATA (atypical angina), NAP (non-anginal pain), ASY (asymptomatic).",
        model_usage=_OPTIONAL,
    ),
    "RestingBP": FeatureDefinition(
        feature="RestingBP",
        definition="Resting systolic blood pressure measured on admission.",
        values="Millimetres of mercury (mmHg); 0 indicates a missing measurement in the raw dataset.",
        model_usage=_OPTIONAL,
    ),
    "Cholesterol": FeatureDefinition(
        feature="Cholesterol",
        definition="Serum total cholesterol.",
        values="Milligrams per decilitre (mg/dL); 0 indicates a missing measurement in the raw dataset.",
        model_usage=_OPTIONAL,
    ),
    "FastingBS": FeatureDefinition(
        feature="FastingBS",
        definition="Whether fasting blood sugar is above 120 mg/dL.",
        values="0 (fasting blood sugar <= 120 mg/dL) or 1 (fasting blood sugar > 120 mg/dL).",
        model_usage=_OPTIONAL,
    ),
    "RestingECG": FeatureDefinition(
        feature="RestingECG",
        definition="The resting electrocardiogram result.",
        values=(
            "Normal, ST (ST-T wave abnormality: T-wave inversions and/or ST elevation or depression "
            "> 0.05 mV), or LVH (probable/definite left ventricular hypertrophy by Estes criteria)."
        ),
        model_usage=_OPTIONAL,
    ),
    "ExerciseAngina": FeatureDefinition(
        feature="ExerciseAngina",
        definition="Whether exercise induced angina during testing.",
        values="Y (yes) or N (no).",
        model_usage=_OPTIONAL,
    ),
    "Oldpeak": FeatureDefinition(
        feature="Oldpeak",
        definition="ST-segment depression induced by exercise relative to rest, from a stress test.",
        values="Numeric ST depression (in mm / mV); higher values indicate more exercise-induced ischemia.",
        model_usage=_OPTIONAL,
    ),
    "ST_Slope": FeatureDefinition(
        feature="ST_Slope",
        definition="The slope of the peak exercise ST segment.",
        values="Up (upsloping), Flat, or Down (downsloping); flat/downsloping suggest ischemia.",
        model_usage=_OPTIONAL,
    ),
}

# Case-insensitive / snake_case / colloquial aliases mapping to canonical feature names.
_ALIASES: dict[str, str] = {
    "age": "Age",
    "sex": "Sex",
    "gender": "Sex",
    "maxhr": "MaxHR",
    "max_hr": "MaxHR",
    "max heart rate": "MaxHR",
    "maximum heart rate": "MaxHR",
    "chestpaintype": "ChestPainType",
    "chest_pain_type": "ChestPainType",
    "chest pain type": "ChestPainType",
    "chest pain": "ChestPainType",
    "restingbp": "RestingBP",
    "resting_bp": "RestingBP",
    "resting blood pressure": "RestingBP",
    "blood pressure": "RestingBP",
    "cholesterol": "Cholesterol",
    "chol": "Cholesterol",
    "fastingbs": "FastingBS",
    "fasting_bs": "FastingBS",
    "fasting blood sugar": "FastingBS",
    "restingecg": "RestingECG",
    "resting_ecg": "RestingECG",
    "resting ecg": "RestingECG",
    "ecg": "RestingECG",
    "exerciseangina": "ExerciseAngina",
    "exercise_angina": "ExerciseAngina",
    "exercise angina": "ExerciseAngina",
    "oldpeak": "Oldpeak",
    "st_depression": "Oldpeak",
    "st depression": "Oldpeak",
    "st_slope": "ST_Slope",
    "stslope": "ST_Slope",
    "st slope": "ST_Slope",
    "slope": "ST_Slope",
}


def get_feature_definition(feature_name: str) -> FeatureDefinition | None:
    """Resolve a feature name to its definition, exact match first then alias fallback."""
    if feature_name in FEATURE_DEFINITIONS:
        return FEATURE_DEFINITIONS[feature_name]
    key = feature_name.strip().lower()
    canonical = _ALIASES.get(key)
    if canonical is not None:
        return FEATURE_DEFINITIONS[canonical]
    return None
