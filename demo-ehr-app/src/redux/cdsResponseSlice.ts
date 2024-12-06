import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    cards: [],
    systemActions: {}
}

const CDSResponseSlice = createSlice({
    name: "cdsResponse",
    initialState,
    reducers: {
        updateCdsResponse(state, action) {
            state.cards = action.payload.cards;
            state.systemActions = action.payload.systemActions;
        },
        resetCdsResponse() {
            return initialState;
        }
    }
});

export const { updateCdsResponse, resetCdsResponse } = CDSResponseSlice.actions;
export default CDSResponseSlice.reducer;