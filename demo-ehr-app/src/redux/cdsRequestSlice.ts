import { createSlice } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid'; 

const initialState = {
  hook: "",
  hookInstance: uuidv4(),
  context: {},
  prefetch: {},
  request: {},
};

const cdsRequestSlice = createSlice({
  name: "cdsRequest",
  initialState,
  reducers: {
    updateCdsHook(state, action) {
      state.hook = action.payload;
    },
    updateCdsContext(state, action) {
      state.context = { ...state.context, ...action.payload };
    },
    updateCdsPrefetch(state, action) {
      state.prefetch = { ...state.prefetch, ...action.payload };
    },
    updateRequest(state, action) {
      state.request = { ...state.request, ...action.payload };
    },
    resetCdsRequest() {
      return initialState;
    },
  },
});

export const {
  updateCdsHook,
  updateCdsContext,
  updateCdsPrefetch,
  resetCdsRequest,
  updateRequest,
} = cdsRequestSlice.actions;
export default cdsRequestSlice.reducer;
