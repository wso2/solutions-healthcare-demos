# Sample FHIR R4 patient bundles

6 synthetic patients, ~1,762 FHIR resources total. Each `patient-NN.json` is a
FHIR R4 **transaction Bundle**; the explorer's "Load sample data" button POSTs
each one to the configured server's base URL. The dataset is deliberately kept
small (~5 MB) so it loads on resource-constrained sandboxes.

Generated with [Synthea](https://github.com/synthetichealth/synthea) (Apache 2.0).
Synthea options used:
```
-p 6 Massachusetts
  --exporter.fhir.use_us_core_ig false
  --exporter.hospital.fhir.export false
  --exporter.practitioner.fhir.export false
  --exporter.years_of_history 5
```

US Core profile extensions are disabled so the bundles validate against a
vanilla FHIR R4 server. Hospital/practitioner bundles are skipped so each file
is a single self-contained patient transaction.

To regenerate:
```sh
git clone --depth 1 https://github.com/synthetichealth/synthea
cd synthea
./run_synthea -p 6 Massachusetts \
  --exporter.fhir.use_us_core_ig false \
  --exporter.hospital.fhir.export false \
  --exporter.practitioner.fhir.export false \
  --exporter.years_of_history 5
# Then copy output/fhir/*.json into this directory and rebuild manifest.json.
```
