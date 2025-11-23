# Deploying HAPI FHIR Server to Choreo

This guide explains how to deploy the HAPI FHIR JPA Server to WSO2 Choreo.

## Quick Start

1. **Create a new Component in Choreo**
   - Login to [Choreo Console](https://console.choreo.dev)
   - Create a new component
   - Component Type: **Docker**
   - Point to this directory: `use-cases/patient-admit/fhir-repository`

2. **Deploy**
   - Choreo will automatically detect the Dockerfile
   - Build and deploy using the `.choreo/component.yaml` configuration
   - The FHIR API will be exposed at the endpoint configured in component.yaml

3. **Access Your FHIR Server**
   - Choreo will provide a URL like: `https://your-fhir-server.choreo.dev`
   - FHIR API: `https://your-fhir-server.choreo.dev/fhir`
   - Web UI: `https://your-fhir-server.choreo.dev`

## Default Configuration

The deployment uses the official `hapiproject/hapi:latest` Docker image with default settings:

- **FHIR Version**: R4
- **Database**: H2 in-memory (resets on restart)
- **Port**: 8080
- **CORS**: Enabled
- **OpenAPI**: Enabled

## Customization (Optional)

### Using Environment Variables

To customize the FHIR server, add environment variables in `.choreo/component.yaml`:

```yaml
environmentVariables:
  # Database configuration (for production)
  - name: SPRING_DATASOURCE_URL
    value: "jdbc:postgresql://your-db:5432/fhir"

  - name: SPRING_DATASOURCE_USERNAME
    value: "fhir_user"

  - name: SPRING_DATASOURCE_PASSWORD
    value: "${DB_PASSWORD}"  # Use Choreo secrets

  - name: SPRING_DATASOURCE_DRIVER_CLASS_NAME
    value: "org.postgresql.Driver"

  # HAPI FHIR configuration
  - name: hapi.fhir.fhir_version
    value: "R4"

  - name: hapi.fhir.default_page_size
    value: "50"

  - name: hapi.fhir.max_page_size
    value: "500"
```

### Common Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `hapi.fhir.fhir_version` | FHIR version (DSTU3, R4, R5) | R4 |
| `hapi.fhir.server_address` | Base URL of server | Auto-detected |
| `hapi.fhir.default_page_size` | Default search page size | 20 |
| `hapi.fhir.allow_external_references` | Allow external refs | true |
| `hapi.fhir.cors.allowed_origin` | CORS allowed origins | * |
| `SPRING_DATASOURCE_URL` | Database JDBC URL | H2 in-memory |

See [all available variables](https://github.com/hapifhir/hapi-fhir-jpaserver-starter#environment-variables).

## Production Deployment

### 1. Use a Persistent Database

**PostgreSQL Example:**

```yaml
environmentVariables:
  - name: SPRING_DATASOURCE_URL
    value: "jdbc:postgresql://db-host:5432/fhir"
  - name: SPRING_DATASOURCE_DRIVER_CLASS_NAME
    value: "org.postgresql.Driver"
  - name: SPRING_DATASOURCE_USERNAME
    value: "fhir_user"
  - name: SPRING_DATASOURCE_PASSWORD
    value: "${DB_PASSWORD}"
  - name: spring.jpa.properties.hibernate.dialect
    value: "org.hibernate.dialect.PostgreSQLDialect"
```

**MySQL Example:**

```yaml
environmentVariables:
  - name: SPRING_DATASOURCE_URL
    value: "jdbc:mysql://db-host:3306/fhir"
  - name: SPRING_DATASOURCE_DRIVER_CLASS_NAME
    value: "com.mysql.cj.jdbc.Driver"
  - name: SPRING_DATASOURCE_USERNAME
    value: "fhir_user"
  - name: SPRING_DATASOURCE_PASSWORD
    value: "${DB_PASSWORD}"
  - name: spring.jpa.properties.hibernate.dialect
    value: "org.hibernate.dialect.MySQL8Dialect"
```

### 2. Configure Resource Limits

Update `.choreo/component.yaml`:

```yaml
resources:
  requests:
    memory: "2Gi"
    cpu: "1000m"
  limits:
    memory: "4Gi"
    cpu: "2000m"
```

### 3. Enable Authentication (Optional)

For OAuth2/OIDC integration, configure in component.yaml or use Choreo's built-in authentication.

## Integration with ADT-A01-to-FHIR Service

Once deployed, update your ADT-A01-to-FHIR service configuration:

**File**: `adt-a01-to-fhir-service/Config.toml`

```toml
fhirServerUrl = "https://your-fhir-server.choreo.dev/fhir"

# If authentication is enabled
tokenUrl = "https://your-oauth-provider/token"
scopes = ["system/Patient.read", "system/Patient.write", "system/Encounter.read", "system/Encounter.write"]
client_id = "your-client-id"
client_secret = "your-client-secret"
```

## Monitoring

### Health Check

```bash
curl https://your-fhir-server.choreo.dev/actuator/health
```

### View Logs

Access logs through the Choreo console's observability dashboard.

### Metrics

Prometheus metrics are available at:
```
https://your-fhir-server.choreo.dev/actuator/metrics
```

## Testing the Deployment

### Check FHIR Capability Statement

```bash
curl https://your-fhir-server.choreo.dev/fhir/metadata
```

### Create a Patient Resource

```bash
curl -X POST https://your-fhir-server.choreo.dev/fhir/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Patient",
    "name": [{
      "family": "Doe",
      "given": ["John"]
    }],
    "gender": "male",
    "birthDate": "1980-01-01"
  }'
```

### Search for Patients

```bash
curl "https://your-fhir-server.choreo.dev/fhir/Patient?family=Doe"
```

## Troubleshooting

### Container won't start
- Check logs in Choreo console
- Verify resource limits are sufficient (min 1GB RAM)
- Check database connectivity if using external DB

### Database errors
- Verify JDBC URL format is correct
- Check database credentials
- Ensure database is accessible from Choreo

### Out of memory
- Increase resource limits in component.yaml
- Consider using JVM memory tuning environment variables

## Resources

- [HAPI FHIR Documentation](https://hapifhir.io/)
- [HAPI FHIR JPA Server Starter](https://github.com/hapifhir/hapi-fhir-jpaserver-starter)
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [WSO2 Choreo Documentation](https://wso2.com/choreo/docs/)
