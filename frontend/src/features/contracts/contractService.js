import axios from 'axios';

const BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:8000/api');
const getUrl = (endpoint) => `${BASE_URL}/${endpoint}/`.replace(/([^:]\/)\/+/g, '$1');

export const listContracts = async () => {
  const response = await axios.get(getUrl('contracts'));
  return response.data;
};

export const updateContract = async (id, data) => {
  const response = await axios.patch(getUrl('contracts') + `${id}/`, data);
  return response.data;
};
