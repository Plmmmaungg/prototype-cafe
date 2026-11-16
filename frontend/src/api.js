import axios from 'axios';
const api=axios.create({baseURL:import.meta.env.VITE_API_URL||'http://localhost:5000/api'});
api.interceptors.request.use(config=>{const token=localStorage.getItem('cm_token');if(token)config.headers.Authorization=`Bearer ${token}`;return config;});
api.interceptors.response.use(response=>response,error=>{
  const isLoginRequest=String(error.config?.url||'').includes('/auth/login');
  if(error.response?.status===401&&!isLoginRequest&&localStorage.getItem('cm_token')){
    localStorage.removeItem('cm_token');localStorage.removeItem('cm_user');
    if(window.location.pathname!=='/')window.location.assign('/');
  }
  return Promise.reject(error);
});
export default api;
