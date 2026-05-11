import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import './styles/sidebar.css'
import './styles/splash.css'
import App from './App'
import {installInputDefaults} from './lib/inputDefaults'

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean; error: Error | null}> {
    state = {hasError: false, error: null as Error | null}

    static getDerivedStateFromError(error: Error) {
        return {hasError: true, error}
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{padding: 32, color: '#c00', fontFamily: 'system-ui, sans-serif'}}>
                    <h2>应用渲染出错</h2>
                    <pre style={{whiteSpace: 'pre-wrap', fontSize: 13, background: '#f5f5f5', padding: 12, borderRadius: 6}}>
                        {this.state.error?.message}
                    </pre>
                    <button
                        style={{marginTop: 16, padding: '8px 20px', cursor: 'pointer'}}
                        onClick={() => this.setState({hasError: false, error: null})}
                    >
                        重试
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}

const container = document.getElementById('root')

installInputDefaults()

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <ErrorBoundary>
            <App/>
        </ErrorBoundary>
    </React.StrictMode>
)
