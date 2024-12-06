import { SelectChangeEvent } from "@mui/material/Select";
import Box from "@mui/material/Box";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";

interface DropdownProps {
  dropdown_options: string[];
  selectedValue: string;
  handleChange: (event: SelectChangeEvent) => void;
  handleOnBlur?: () => void;
  form_selector_width: number;
  dropdown_label: string;
  isDisabled?: boolean;
  borderColor?: string;
}

export const DropDownBox: React.FC<DropdownProps> = ({
  dropdown_options,
  selectedValue,
  handleChange,
  handleOnBlur,
  form_selector_width,
  dropdown_label,
  isDisabled = false,
  borderColor,
}) => (
  <Box sx={{ display: "flex", alignItems: "flex-end" }}>
    <FormControl
      sx={{ m: 1, minWidth: form_selector_width }}
      disabled={isDisabled}
    >
      <InputLabel id={`${dropdown_label}-label`}>{dropdown_label}</InputLabel>
      <Select
        labelId={`${dropdown_label}-label`}
        id={`${dropdown_label}-helper`}
        value={selectedValue}
        label={dropdown_label}
        onChange={handleChange}
        onBlur={handleOnBlur}
        sx={{
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: { borderColor },
          },
        }}
      >
        <MenuItem value="">
          <em>None</em>
        </MenuItem>
        {dropdown_options.map((dropdown_option) => (
          <MenuItem
            value={dropdown_option}
            key={dropdown_option}
            sx={{ fontSize: "0.8rem" }}
          >
            {dropdown_option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  </Box>
);
