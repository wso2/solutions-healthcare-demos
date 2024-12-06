import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  selectedPatientId: '',
};

const patientSlice = createSlice({
  name: 'patient',
  initialState,
  reducers: {
    selectPatient(state, action) {
      state.selectedPatientId = action.payload;
    },
  },
});

export const { selectPatient } = patientSlice.actions;
export default patientSlice.reducer;