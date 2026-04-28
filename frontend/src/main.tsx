import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import './styles/sidebar.css'
import './styles/splash.css'
import App from './App'
import {installInputDefaults} from './lib/inputDefaults'

const container = document.getElementById('root')

installInputDefaults()

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>
)
