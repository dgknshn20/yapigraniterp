import axios from 'axios';

const BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:8000/api');
const getUrl = (endpoint) => `${BASE_URL}/${endpoint}/`.replace(/([^:]\/)\/+/g, '$1');

const listNotifications = async () => {
  const response = await axios.get(getUrl('notifications'));
  return response.data;
};

const getUnreadNotifications = async () => {
  const response = await axios.get(getUrl('notifications') + 'unread/');
  return response.data;
};

const markNotificationRead = async (id) => {
  const response = await axios.post(getUrl('notifications') + `${id}/mark-read/`);
  return response.data;
};

const markAllRead = async () => {
  const response = await axios.post(getUrl('notifications') + 'mark-all-read/');
  return response.data;
};

const notificationService = {
  listNotifications,
  getUnreadNotifications,
  markNotificationRead,
  markAllRead,
};

export default notificationService;
