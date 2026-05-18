import React from 'react'
import ReactDOM from 'react-dom/client'
import { RootRoute, Router, RootRouteWithoutId } from '@tanstack/react-router'
import { getRouter } from './router'
import './styles.css'

const router = getRouter()

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <router.Provider />
  </React.StrictMode>,
)
