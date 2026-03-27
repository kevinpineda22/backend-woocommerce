/**
 * ecommerceApi.js — Cliente API centralizado para el módulo Ecommerce
 *
 * Uso: import { ecommerceApi } from '../shared/ecommerceApi';
 *
 * Ejemplos:
 *   ecommerceApi.get('/pendientes', { params: { sede_id: 'abc' } })
 *   ecommerceApi.post('/crear-sesion', { id_picker: '...', ids_pedidos: [...] })
 *   analyticsApi.get('/performance', { params: { range: '7d' } })
 *
 * Cache busting (t=timestamp) se agrega automáticamente a los GET.
 */
import axios from "axios";

const API_BASE = "https://backend-woocommerce.vercel.app/api";

const ECOMMERCE_API_BASE = `${API_BASE}/orders`;
const ANALYTICS_API_BASE = `${API_BASE}/analytics`;

const addCacheBusting = (config) => {
  if (config.method === "get") {
    config.params = { ...config.params, t: Date.now() };
  }
  return config;
};

const ecommerceApi = axios.create({ baseURL: ECOMMERCE_API_BASE });
ecommerceApi.interceptors.request.use(addCacheBusting);

const analyticsApi = axios.create({ baseURL: ANALYTICS_API_BASE });
analyticsApi.interceptors.request.use(addCacheBusting);

export { ecommerceApi, analyticsApi, API_BASE };
