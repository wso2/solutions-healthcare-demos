import {
  Card,
  CardHeader,
  CardMedia,
  CardContent,
  Collapse,
  Grid,
} from "@mui/material";
import { useNavigate } from 'react-router-dom';
import { DEVICE } from "../constants/data";
import { Box } from "@mui/material";
import { useContext } from "react";
import { ExpandedContext } from "../utils/expanded_context";
import { useDispatch } from "react-redux";
import { updateCdsHook, resetCdsRequest } from "../redux/cdsRequestSlice";

interface CardData {
  name: string;
  imagePath: string;
  description: string;
}

const CardComponent = ({ data }: { data: CardData }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  dispatch(resetCdsRequest());
  dispatch(updateCdsHook("order-select"));

  const handleDrugClick = (drugName : string) => {
    navigate(`/dashboard/device-order/${drugName}`);
  };

  return (
    <Grid item xs={12} sm={4}>
      <Card onClick={() => handleDrugClick(data.name)}>
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          flexDirection="column"
          marginTop="15px"
        >
          <CardMedia>
            <img
              src="/gloco_meter.png"
              alt={data.name}
              style={{
                height: "150px", 
                width: "auto", 
                objectFit: "contain", 
              }}
            />
          </CardMedia>
          <CardHeader title={data.name} style={{ cursor: "pointer" }} />
          <Collapse in={true} timeout="auto" unmountOnExit>
            <CardContent style={{marginRight: 20, textAlign:"justify"}} >{data.description}</CardContent>
          </Collapse>
        </Box>
      </Card>
    </Grid>
  );
};


export default function DeviceOrderPage() {
  const { expanded } = useContext(ExpandedContext);
  return (
    <div style={{ display: "grid", gridTemplateColumns: expanded ? "repeat(1, 1fr)" : "repeat(3, 1fr)", gap: "20px", marginLeft: expanded ? "10vw" : "2vw", marginRight: expanded ? "10vw" : 0}}>
        {DEVICE.map((item, index) => (
          <CardComponent key={index} data={item} />
        ))}
    </div>
  );
}
