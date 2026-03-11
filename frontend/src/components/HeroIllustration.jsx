import './HeroIllustration.css';

export default function HeroIllustration() {
  return (
    <div className="hero-illus">
      {/* Coins floating */}
      <div className="coin coin--1">🪙</div>
      <div className="coin coin--2">🪙</div>
      <div className="coin coin--3">💰</div>
      <div className="bill bill--1">💵</div>
      <div className="bill bill--2">💴</div>

      {/* Washing machine */}
      <div className="washing-machine neo-card">
        <div className="machine-top">
          <div className="machine-knob" />
          <div className="machine-knob" />
        </div>
        <div className="machine-drum-wrap">
          <div className="machine-drum">
            <div className="drum-inner">
              <div className="drum-hole" />
              <div className="drum-hole" />
              <div className="drum-hole" />
            </div>
          </div>
        </div>
        <div className="machine-bottom">
          <div className="machine-btn" />
          <div className="machine-btn machine-btn--orange" />
        </div>
      </div>

      {/* Worker character */}
      <div className="worker">
        {/* Head */}
        <div className="worker__head">
          <div className="worker__face">
            <div className="worker__eyes">
              <span className="worker__eye" />
              <span className="worker__eye" />
            </div>
            <div className="worker__smile" />
          </div>
          <div className="worker__hat" />
        </div>
        {/* Body */}
        <div className="worker__body">
          <div className="worker__arm worker__arm--left" />
          <div className="worker__arm worker__arm--right" />
          <div className="worker__torso" />
        </div>
        {/* Legs */}
        <div className="worker__legs">
          <div className="worker__leg" />
          <div className="worker__leg" />
        </div>
      </div>

      {/* Sparkles */}
      <div className="sparkle sparkle--1">✨</div>
      <div className="sparkle sparkle--2">⭐</div>
      <div className="sparkle sparkle--3">✨</div>
    </div>
  );
}
