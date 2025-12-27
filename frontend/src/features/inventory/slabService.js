import axios from 'axios';

// Expected format: http://localhost:8000/api
const BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:8000/api');

const getUrl = (endpoint) => `${BASE_URL}/${endpoint}/`.replace(/([^:]\/)\/+/g, "$1");

const SLABS_URL = getUrl('slabs');
const PRODUCTS_URL = getUrl('product-definitions');
const UPLOAD_URL = getUrl('upload');

export const listSlabs = async () => {
  const response = await axios.get(SLABS_URL);
  return response.data;
};

export const listProducts = async () => {
  const response = await axios.get(PRODUCTS_URL);
  return response.data;
};

export const createProductDefinition = async (data) => {
  const response = await axios.post(PRODUCTS_URL, data);
  return response.data;
};

export const createSlab = async (data) => {
  const response = await axios.post(SLABS_URL, data);
  return response.data;
};

export const updateSlab = async (id, data) => {
  const response = await axios.patch(`${SLABS_URL}${id}/`, data);
  return response.data;
};

export const deleteSlab = async (id) => {
  await axios.delete(`${SLABS_URL}${id}/`);
  return true;
};

export const uploadFile = async (file) => {
  const form = new FormData();
  form.append('file', file);
  const response = await axios.post(UPLOAD_URL, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const getMediaBase = () => {
  // Convert http://host:port/api -> http://host:port
  return BASE_URL.replace(/\/?api\/?$/, '');
};
