import axios from 'axios';

const BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:8000/api');
const getUrl = (ep) => `${BASE_URL}/${ep}/`.replace(/([^:]\/)(\/)+/g, '$1');

const PROPOSALS_URL = getUrl('proposals');
const PROPOSAL_ITEMS_URL = getUrl('proposal-items');

export const listProposals = async () => {
  const response = await axios.get(PROPOSALS_URL);
  return response.data;
};

export const createProposal = async (data) => {
  const response = await axios.post(PROPOSALS_URL, data);
  return response.data;
};

export const createProposalItem = async (data) => {
  const response = await axios.post(PROPOSAL_ITEMS_URL, data);
  return response.data;
};

export const finalizeProposal = async (id, data = {}) => {
  const response = await axios.post(`${PROPOSALS_URL}${id}/finalize/`, data);
  return response.data;
};

export const deleteProposal = async (id) => {
  await axios.delete(`${PROPOSALS_URL}${id}/`);
  return true;
};
