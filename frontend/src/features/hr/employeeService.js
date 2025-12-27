import axios from 'axios';

const BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:8000/api');
const getUrl = (ep) => `${BASE_URL}/${ep}/`.replace(/([^:]\/)\/+/g, '$1');

const EMPLOYEES_URL = getUrl('employees');

export const listEmployees = async () => {
  const response = await axios.get(EMPLOYEES_URL);
  return response.data;
};

export const createEmployee = async (data) => {
  const response = await axios.post(EMPLOYEES_URL, data);
  return response.data;
};

export const updateEmployee = async (id, data) => {
  const response = await axios.patch(`${EMPLOYEES_URL}${id}/`, data);
  return response.data;
};
