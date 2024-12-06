import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import Typography from '@mui/material/Typography';
import { CardActionArea } from '@mui/material';
import { ServiceCardProps } from "./interfaces/card";
import { Link } from 'react-router-dom';

export default function MultiActionAreaCard(
    {
        serviceImagePath,
        serviceName,
        serviceDescription,
        path
      }: ServiceCardProps ) {
  return (
    <Card sx={{maxWidth: "30vw", borderRadius: 5}}>
      <Link to={path} style={{textDecoration: "none", color: "black"}}>
      <CardActionArea sx={{display: "flex"}}>
        <CardMedia
          component="img"
          height="140"
          image={serviceImagePath}
          alt="service image"
          sx={{ objectFit: "contain", width: "30%", height: "80%", marginLeft: "1vw"}}
        />
        <CardContent>
          <Typography gutterBottom variant="h5" component="div">
            {serviceName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {serviceDescription}
          </Typography>
        </CardContent>
      </CardActionArea>
      </Link>
    </Card>
  );
}