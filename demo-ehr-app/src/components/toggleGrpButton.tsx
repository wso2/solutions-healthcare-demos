import * as React from 'react';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

interface ToggleGrpButtonProps {
  dosages: string[];
  selectedDosage: string;
  handleDosageChange: (event: React.MouseEvent<HTMLElement>, value: string) => void;
}

const ToggleGrpButton: React.FC<ToggleGrpButtonProps> = ({ dosages, selectedDosage, handleDosageChange }) => {

  return (
    <ToggleButtonGroup
      value={selectedDosage}
      exclusive
      onChange={handleDosageChange}
    >
      {dosages.map((dosage) => (
        <ToggleButton key={dosage} value={dosage} sx={{textTransform: "none", height: 20}}>
          {dosage}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export default ToggleGrpButton;