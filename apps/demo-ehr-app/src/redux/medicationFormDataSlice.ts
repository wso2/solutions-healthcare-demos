// Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface MedicationFormDataState {
  treatingSickness: string;
  medication: string;
  quantity: number;
  duration: string;
  frequency: string;
  startDate: Date | null;
}

const initialState: MedicationFormDataState = {
  treatingSickness: '',
  medication: '',
  quantity: 0,
  duration: '',
  frequency: '',
  startDate: new Date() as Date | null,
};

const medicationFormDataSlice = createSlice({
  name: 'medicationFormDataSlice',
  initialState,
  reducers: {
    updateMedicationFormData(state, action: PayloadAction<Partial<MedicationFormDataState>>) {
        console.log("action.payload", action.payload);
      return { ...state, ...action.payload };
    },
    resetMedicationFormData() {
      return initialState;
    },
  },
});

export const { updateMedicationFormData, resetMedicationFormData } = medicationFormDataSlice.actions;
export default medicationFormDataSlice.reducer;
