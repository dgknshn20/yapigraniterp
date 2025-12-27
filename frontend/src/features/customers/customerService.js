import axios from 'axios';

const BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:8000/api');
const CUSTOMERS_URL = `${BASE_URL}/customers/`.replace(/([^:]\/)\/+/g, '$1');

export const listCustomers = async () => {
  const response = await axios.get(CUSTOMERS_URL);
  return response.data;
};

export const createCustomer = async (data) => {
  const response = await axios.post(CUSTOMERS_URL, data);
  return response.data;
};

export const updateCustomer = async (id, data) => {
  const response = await axios.patch(`${CUSTOMERS_URL}${id}/`, data);
  return response.data;
};

export const getCustomerDetail = async (id) => {
  const response = await axios.get(`${CUSTOMERS_URL}${id}/`);
  return response.data;
};

export const deleteCustomer = async (id) => {
  const response = await axios.delete(`${CUSTOMERS_URL}${id}/`);
  return response.data;
};
