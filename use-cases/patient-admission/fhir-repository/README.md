# HAPI FHIR JPA Server Repository

This directory contains a Dockerized HAPI FHIR JPA Server that serves as the FHIR repository for the ADT-A01 to FHIR integration service.

## Overview

The HAPI FHIR JPA Server provides a fully compliant FHIR R4 REST API for storing and retrieving healthcare resources such as:
- Patient resources
- Encounter resources
- Observation resources
- And other FHIR resources

This implementation uses the **official HAPI FHIR Docker image** from [hapiproject/hapi](https://hub.docker.com/r/hapiproject/hapi) on Docker Hub.

## Architecture

```
HL7v2 Client → ADT-A01-to-FHIR Service → HAPI FHIR Repository (this component)
```

## Files

- **Dockerfile** - Uses the official hapiproject/hapi Docker image with default configuration
- **application.yaml** - (Optional) Custom HAPI FHIR configuration for advanced use cases
- **.choreo/component.yaml** - WSO2 Choreo deployment configuration

## Local Development

### Prerequisites
- Docker installed
- At least 2GB RAM available for the container

### Build the Docker Image

```bash
cd fhir-repository
docker build -t fhir-repository .
```

### Run Locally

Using the built image:
```bash
docker run -p 8080:8080 fhir-repository
```

Or use the official image directly (same default configuration):
```bash
docker run -p 8080:8080 hapiproject/hapi:latest
```

The FHIR server will be available at:
- **FHIR API**: `http://localhost:8080/fhir`
- **Web UI**: `http://localhost:8080`

**Note**: The server takes about 60 seconds to fully start up.

### Test the Server

Access the FHIR metadata endpoint:
```bash
curl http://localhost:8080/fhir/metadata
```

Access the web UI:
```
http://localhost:8080
```

### Create a Patient Resource

```bash
curl -X POST http://localhost:8080/fhir/Patient \
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

## Choreo Deployment

### Deploy to Choreo

1. **Create a new component** in your Choreo project
   - Component Type: `Docker`
   - Repository: Point to this directory

2. **Configure Environment Variables** (optional)
   - The component.yaml already defines common environment variables
   - For production, configure a persistent database (PostgreSQL/MySQL)

3. **Deploy**
   - Choreo will automatically build using the Dockerfile
   - The FHIR API will be exposed based on the endpoint configuration

### Production Database Configuration

For production deployments, use a persistent database instead of H2:

#### PostgreSQL Example

```yaml
environmentVariables:
  SPRING_DATASOURCE_URL: "jdbc:postgresql://your-db-host:5432/fhir"
  SPRING_DATASOURCE_DRIVER_CLASS_NAME: "org.postgresql.Driver"
  SPRING_DATASOURCE_USERNAME: "fhir_user"
  SPRING_DATASOURCE_PASSWORD: "${DB_PASSWORD}" # Use Choreo secrets
  HIBERNATE_DIALECT: "org.hibernate.dialect.PostgreSQLDialect"
```

#### MySQL Example

```yaml
environmentVariables:
  SPRING_DATASOURCE_URL: "jdbc:mysql://your-db-host:3306/fhir"
  SPRING_DATASOURCE_DRIVER_CLASS_NAME: "com.mysql.cj.jdbc.Driver"
  SPRING_DATASOURCE_USERNAME: "fhir_user"
  SPRING_DATASOURCE_PASSWORD: "${DB_PASSWORD}" # Use Choreo secrets
  HIBERNATE_DIALECT: "org.hibernate.dialect.MySQL8Dialect"
```

## Integration with ADT-A01-to-FHIR Service

Update the [adt-a01-to-fhir-service Config.toml](../adt-a01-to-fhir-service/Config.toml) to point to this FHIR server:

```toml
fhirServerUrl = "https://your-choreo-fhir-endpoint/fhir"
```

If using OAuth2 authentication:
```toml
tokenUrl = "https://your-oauth-provider/token"
scopes = ["system/Patient.read", "system/Patient.write", "system/Encounter.read", "system/Encounter.write"]
client_id = "your-client-id"
client_secret = "your-client-secret"
```

## FHIR Operations Supported

### Base Operations
- **Create**: `POST /fhir/{resourceType}`
- **Read**: `GET /fhir/{resourceType}/{id}`
- **Update**: `PUT /fhir/{resourceType}/{id}`
- **Delete**: `DELETE /fhir/{resourceType}/{id}`
- **Search**: `GET /fhir/{resourceType}?{searchParams}`

### Special Operations
- **Metadata**: `GET /fhir/metadata` - Server capability statement
- **History**: `GET /fhir/{resourceType}/{id}/_history`
- **Validate**: `POST /fhir/{resourceType}/$validate`

## Configuration

### Key Configuration Options

All configuration is managed through [application.yaml](application.yaml):

- **Database**: Configure your database connection
- **CORS**: Enable/disable CORS for web access
- **Page Size**: Control search result pagination
- **Validation**: Enable/disable resource validation
- **Subscriptions**: Enable real-time subscriptions (disabled by default)

### Environment Variables

Override any configuration using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `SPRING_DATASOURCE_URL` | Database URL | `jdbc:h2:file:./target/database/h2` |
| `SPRING_DATASOURCE_USERNAME` | Database username | `admin` |
| `SPRING_DATASOURCE_PASSWORD` | Database password | `admin` |
| `HAPI_FHIR_SERVER_ADDRESS` | Server base URL | `http://localhost:8080/fhir/` |
| `SPRING_CONFIG_LOCATION` | Custom config file | `/app/config/application.yaml` |

## Monitoring

### Health Check

```bash
curl http://localhost:8080/actuator/health
```

### Metrics

Prometheus metrics are available at:
```
http://localhost:8080/actuator/metrics
```

### Logs

Application logs are output to stdout/stderr and can be viewed through:
- Docker logs: `docker logs <container-id>`
- Choreo console: View logs in the Choreo observability dashboard

## Security Considerations

1. **Authentication**: For production, enable OAuth2/OIDC authentication
2. **Network**: The Choreo component is configured with `Project` visibility by default
3. **Database**: Use encrypted connections for production databases
4. **Secrets**: Store database credentials in Choreo secrets, not in code

## Troubleshooting

### Container won't start
- Check Docker logs: `docker logs <container-id>`
- Verify port 8080 is available
- Ensure sufficient memory (min 1GB)

### Database connection issues
- Verify `SPRING_DATASOURCE_URL` is correct
- Check database credentials
- Ensure database is accessible from the container

### Out of Memory errors
- Increase `JAVA_OPTS` memory settings
- Adjust resource limits in component.yaml

## Resources

- [HAPI FHIR Documentation](https://hapifhir.io/)
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [WSO2 Choreo Documentation](https://wso2.com/choreo/docs/)

## Version

- Base Image: `hapiproject/hapi:latest`
- FHIR Version: R4
- Java Version: 21 (from official image)

## Additional Notes

### Why use the official HAPI FHIR image?

1. **Maintained by HAPI FHIR team**: Regular updates and security patches
2. **Production-ready**: Thoroughly tested and optimized
3. **Smaller image size**: No build stage needed, faster deployments
4. **Easier upgrades**: Just update the image tag

### Customization

This setup uses the official image with default configuration, which includes:
- FHIR R4 support
- H2 in-memory database (suitable for demos/testing)
- CORS enabled
- OpenAPI/Swagger UI enabled at the root URL
- Non-root user execution for security

For production or advanced use cases, you can customize using environment variables in the Choreo component.yaml. See the [official documentation](https://github.com/hapifhir/hapi-fhir-jpaserver-starter#environment-variables) for all available options.
