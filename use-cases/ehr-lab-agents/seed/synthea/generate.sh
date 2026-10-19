#!/usr/bin/env bash
# Regenerates the EHR seed data from Synthea (https://github.com/synthetichealth/synthea).
#
#   ./seed/synthea/generate.sh
#
# Synthea gives the EHR a realistic clinic population: years of encounters, conditions, medications,
# immunizations, procedures, vitals, labs and clinical notes, coded in SNOMED CT, LOINC, RxNorm and CVX.
# transform.py then trims that to what an EHR integration needs and overlays the demo personas'
# storyline (storyline.py), so the clinical story the agents find is the same on every run.
#
# The output (seed/ehr/) is committed, so a normal reset never needs Java or Synthea.
# Run this only to change the population. Same Synthea version + same seeds = same output.
set -euo pipefail

SYNTHEA_VERSION="v4.0.0"
DIR="$(cd "$(dirname "$0")" && pwd)"
CACHE="$DIR/.cache"
JAR="$CACHE/synthea-$SYNTHEA_VERSION.jar"
REFERENCE_DATE="20261017"   # "today" for the generated histories
POPULATION=40               # per run; transform.py keeps the personas plus a handful of others

mkdir -p "$CACHE"
if [[ ! -f "$JAR" ]]; then
  echo "Downloading Synthea $SYNTHEA_VERSION…"
  curl -fsSL -o "$JAR.part" \
    "https://github.com/synthetichealth/synthea/releases/download/$SYNTHEA_VERSION/synthea-with-dependencies.jar"
  mv "$JAR.part" "$JAR"
fi

# Two runs: <name> <seed> <city>. Different seeds and towns give the clinic a varied population.
run_synthea() {
  local name="$1" seed="$2" city="$3" out="$CACHE/out-$1"
  rm -rf "$out"
  echo "Synthea: $name ($POPULATION patients, $city MA, seed $seed)"
  (cd "$CACHE" && java -Duser.timezone=America/New_York -jar "$JAR" \
    -s "$seed" -cs "$seed" -p "$POPULATION" -a 30-75 -r "$REFERENCE_DATE" \
    --exporter.baseDirectory="$out" \
    --generate.only_alive_patients=true \
    --generate.append_numbers_to_person_names=false \
    --exporter.fhir.export=true \
    --exporter.fhir.transaction_bundle=true \
    --exporter.hospital.fhir.export=true \
    --exporter.practitioner.fhir.export=true \
    --exporter.ccda.export=false \
    --exporter.csv.export=false \
    --exporter.metadata.export=false \
    Massachusetts "$city" >/dev/null)
}

run_synthea boston 20261 Boston
run_synthea worcester 20262 Worcester

# SKIP_TRANSFORM=1 stops here, to inspect the raw Synthea output in .cache/out-*.
[[ "${SKIP_TRANSFORM:-0}" == 1 ]] && exit 0

python3 "$DIR/transform.py" --synthea "$CACHE" --out "$DIR/.."
