import splashLogo from "../assets/images/start.png";

export function SplashScreen() {
    return (
        <div className="splash-screen">
            <div className="splash-bg-decoration">
                <div className="splash-orb splash-orb--1" />
                <div className="splash-orb splash-orb--2" />
                <div className="splash-orb splash-orb--3" />
            </div>
            <div className="splash-content">
                <div className="splash-logo-wrap">
                    <div className="splash-pulse-ring" />
                    <div className="splash-pulse-ring splash-pulse-ring--delay" />
                    <img src={splashLogo} alt="SQLCompass" className="splash-logo" />
                </div>
                <div className="splash-brand">SQLCompass</div>
                <div className="splash-tagline">更懂开发的数据库客户端</div>
                <div className="splash-loader">
                    <div className="splash-loader-track">
                        <div className="splash-loader-thumb" />
                    </div>
                </div>
            </div>
        </div>
    );
}
