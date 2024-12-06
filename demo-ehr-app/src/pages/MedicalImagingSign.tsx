import {
  Button,
  CardHeader,
  CardContent,
  Typography,
  CardActions,
  SelectChangeEvent,
  Box,
  TextField,
  Alert,
  Snackbar,
} from "@mui/material";
import { DropDownBox } from "../components/dropDown";
import { LAB_TEST, ORDER_DISPATCH_CDS_REQUEST } from "../constants/data";
import { SCREEN_WIDTH } from "../constants/page";
import { useContext, useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { updateCdsHook } from "../redux/cdsRequestSlice";
import { ExpandedContext } from "../utils/expanded_context";
import { updateCdsResponse } from "../redux/cdsResponseSlice";
import axios from "axios";
import { CdsCard, CdsResponse } from "./MedicalImaging";
import { Card } from "@chakra-ui/react";

function MedicalImagingSign() {
  const { expanded } = useContext(ExpandedContext);
  const dispatch = useDispatch();
  const selectedPatientId = useSelector(
    (state: any) => state.patient.selectedPatientId
  );

  const validateError = (
    <>
      <Alert severity="error" sx={{ marginLeft: 1 }}>
        This is an mandotary field.
      </Alert>
    </>
  );

  const vertical = "bottom";
  const horizontal = "right";

  const [patientId] = useState("PA2347");
  const [practionerId] = useState("PT567498");

  const [enableNotification1, setEnableNotification1] = useState(false);

  const [selectedImagingCenter, setSelectedImagingCenter] = useState("");

  const [isImagingCenterChanged, setIsImagingCenterChanged] = useState(false);

  const [enableSubmitButton, setEnableSubmitButton] = useState(false);

  const [cdsCards, setCdsCards] = useState<CdsCard[]>([]);

  const [isCrdCheckFinished, setCrdCheckFinished] = useState(false);

  const [enableNextStep, setEnableNextStep] = useState(false);

  const form_selector_width = SCREEN_WIDTH * 0.3;

  const handleScheduleClick = () => {
    setEnableNotification1(true);
    setEnableNextStep(true);
  };

  const handleChangeImagingCenter = (event: SelectChangeEvent) => {
    setSelectedImagingCenter(event.target.value);
    setCrdCheckFinished(false);
  };

  const handleOnBlurImagingCenter = () => {
    setIsImagingCenterChanged(true);
  };

  const handleCrdCheck = () => {
    const a = ORDER_DISPATCH_CDS_REQUEST(
      patientId,
      practionerId,
      selectedImagingCenter
    );
    axios
      .post<CdsResponse>(
        "https://c32618cf-389d-44f1-93ee-b67a3468aae3-dev.e1-us-east-azure.choreoapis.dev/cmsdemosetups/cds-server/v1.0/cds-services/book-imaging-center",
        a
      )
      .then<CdsResponse>((res) => {
        setCdsCards(res.data.cards);
        dispatch(
          updateCdsResponse({ cards: res.data.cards, systemActions: {} })
        );
        setEnableSubmitButton(true);
        setCrdCheckFinished(true);
        return res.data;
      })
      .catch((err) => console.log(err));
  };

  const isFormValid = () => {
    return selectedImagingCenter != "";
  };

  useEffect(() => {
    dispatch(updateCdsHook("order-dispatch"));
  }, [selectedImagingCenter, selectedPatientId]);

  return (
    <>
      <div
        style={{ display: "flex", flexDirection: expanded ? "column" : "row", marginRight: 200 }}
      >
        {/* {expanded && (
          <img
            src={appointmentBookImg}
            alt="Healthcare"
            style={{
              marginLeft: SCREEN_WIDTH * 0.05,
              height: SCREEN_HEIGHT * 0.5,
              width: SCREEN_WIDTH * 0.3,
            }}
          />
        )} */}

        <div style={{ marginLeft: 80 }}>
          <div
            style={{
              fontSize: 35,
              fontWeight: 700,
              marginBottom: 30,
              marginLeft: 10,
            }}
          >
            Select a Imaging Center
          </div>

          <TextField
            disabled
            label="Test Number *"
            variant="outlined"
            defaultValue="TE-A762"
            sx={{
              width: 520,
              marginLeft: 1,
              marginBottom: 2,
            }}
          />

          <DropDownBox
            dropdown_label="Imaging center"
            dropdown_options={LAB_TEST.imagingCenter}
            selectedValue={selectedImagingCenter}
            handleChange={handleChangeImagingCenter}
            handleOnBlur={handleOnBlurImagingCenter}
            form_selector_width={form_selector_width}
            isDisabled={enableNextStep}
          />
          {isImagingCenterChanged &&
            selectedImagingCenter === "" &&
            validateError}

          <div style={{ display: "flex", flexDirection: "row" }}>
            <Button
              variant="contained"
              onClick={() => handleCrdCheck()}
              disabled={!isFormValid() || isCrdCheckFinished}
              style={{
                borderRadius: 20,
                marginTop: 20,
              }}
            >
              Check Payer Requirements
            </Button>
            <Button
              variant="contained"
              disabled={!enableSubmitButton || enableNextStep}
              onClick={handleScheduleClick}
              style={{
                borderRadius: 20,
                marginLeft: 20,
                marginTop: 20,
              }}
            >
              Schedule
            </Button>
          </div>
        </div>
      </div>

      <Box marginBottom={28}></Box>

      <Box sx={{ display: "flex", flexDirection: "row" }} padding={10}>
        {cdsCards.length > 0 &&
          cdsCards.map((card) => (
            <Box sx={{ boxShadow: 2, borderRadius: 3, marginRight: 2 }}>
              <Card variant="outlined" width={310}>
                <CardHeader title={card.summary} subheader={card.indicator} />
                <CardContent>
                  <Typography
                    gutterBottom
                    sx={{ color: "text.secondary", fontSize: 14, mb: 3 }}
                  >
                    {card.detail}
                  </Typography>
                  <Typography variant="h6" component="div">
                    Suggestions
                  </Typography>
                  <Typography sx={{ color: "text.secondary", mb: 1.5 }}>
                    {card.selectionBehavior}
                  </Typography>
                  <Typography variant="body2">
                    <ul>
                      {card.suggestions?.map((suggestion) => (
                        <li>{suggestion.label}</li>
                      ))}
                    </ul>
                  </Typography>
                </CardContent>
                {card.links != null && (
                  <CardActions>
                    Still, not applied?
                    <Link target="_blank" to={"prior-auth"}>
                      Apply
                    </Link>
                  </CardActions>
                )}
              </Card>
            </Box>
          ))}
      </Box>

      {enableNotification1 && (
        <Snackbar
          anchorOrigin={{ vertical, horizontal }}
          open={true}
          autoHideDuration={3000}
          onClose={() => {
            setEnableNotification1(false);
          }}
          message="Note archived"
          action={true}
          key={vertical + horizontal}
        >
          <Alert
            onClose={() => {
              setEnableNotification1(false);
            }}
            severity="info"
            variant="filled"
            sx={{ width: "100%" }}
          >
            Request have been sent to respective laboratory.
          </Alert>
        </Snackbar>
      )}
    </>
  );
}

export default MedicalImagingSign;
