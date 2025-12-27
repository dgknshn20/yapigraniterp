import { createSlice } from '@reduxjs/toolkit';

const loadUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const initialState = {
  user: loadUser(),
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action) {
      state.user = action.payload;
      localStorage.setItem('user', JSON.stringify(action.payload));
    },
    logout(state) {
      state.user = null;
      localStorage.removeItem('user');
    },
  },
});

export const { setUser, logout } = authSlice.actions;
export default authSlice.reducer;
