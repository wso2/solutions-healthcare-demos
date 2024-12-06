import { configureStore } from '@reduxjs/toolkit';
import patientReducer from './patientSlice';
import cdsRequestSlice from './cdsRequestSlice';
import cdsResponseSlice from './cdsResponseSlice';

export default configureStore({
  reducer: {
    patient: patientReducer,
    cdsRequest: cdsRequestSlice,
    cdsResponse: cdsResponseSlice,
  },
});