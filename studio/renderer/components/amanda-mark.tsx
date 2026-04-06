import { useId } from "react";

export function AmandaMark({
  className,
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const logoGradient = `amanda-logo-gradient-${id}`;
  const breathingGradient1 = `amanda-breathing-gradient-1-${id}`;
  const breathingGradient2 = `amanda-breathing-gradient-2-${id}`;
  const breathingGradient3 = `amanda-breathing-gradient-3-${id}`;
  const breathingGradient4 = `amanda-breathing-gradient-4-${id}`;
  const flowMask = `amanda-flow-mask-${id}`;
  const glow = `amanda-glow-${id}`;

  return (
    <svg
      aria-label="Amanda geometric logo"
      className={`amanda-mark-svg ${animated ? "is-animated" : "is-static"}${className ? ` ${className}` : ""}`}
      role="img"
      viewBox="0 0 560 500"
    >
      <defs>
        <linearGradient id={logoGradient} gradientUnits="userSpaceOnUse" x1="145" x2="415" y1="280" y2="280">
          <stop offset="0%" stopColor="#71b7f5">
            {animated ? (
              <animate
                attributeName="stop-color"
                dur="7s"
                repeatCount="indefinite"
                values="#71b7f5;#a596f1;#71b7f5"
              />
            ) : null}
          </stop>
          <stop offset="25%" stopColor="#a596f1">
            {animated ? (
              <animate
                attributeName="stop-color"
                dur="7s"
                repeatCount="indefinite"
                values="#a596f1;#c68eea;#a596f1"
              />
            ) : null}
          </stop>
          <stop offset="50%" stopColor="#c68eea">
            {animated ? (
              <animate
                attributeName="stop-color"
                dur="7s"
                repeatCount="indefinite"
                values="#c68eea;#ee9dc5;#c68eea"
              />
            ) : null}
          </stop>
          <stop offset="75%" stopColor="#ee9dc5">
            {animated ? (
              <animate
                attributeName="stop-color"
                dur="7s"
                repeatCount="indefinite"
                values="#ee9dc5;#f4b69d;#ee9dc5"
              />
            ) : null}
          </stop>
          <stop offset="100%" stopColor="#f4b69d">
            {animated ? (
              <animate
                attributeName="stop-color"
                dur="7s"
                repeatCount="indefinite"
                values="#f4b69d;#ee9dc5;#f4b69d"
              />
            ) : null}
          </stop>
          {animated ? (
            <>
              <animate attributeName="x1" dur="9s" repeatCount="indefinite" values="145;240;90;200;145" />
              <animate attributeName="y1" dur="9s" repeatCount="indefinite" values="280;120;380;180;280" />
              <animate attributeName="x2" dur="9s" repeatCount="indefinite" values="415;320;470;360;415" />
              <animate attributeName="y2" dur="9s" repeatCount="indefinite" values="280;440;180;380;280" />
            </>
          ) : null}
        </linearGradient>

        <radialGradient cx="280" cy="264" gradientUnits="userSpaceOnUse" id={breathingGradient1} r="200">
          <stop offset="0%" stopColor="#c68eea" stopOpacity="0.5" />
          <stop offset="50%" stopColor="#a596f1" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#71b7f5" stopOpacity="0" />
          {animated ? (
            <>
              <animate attributeName="cx" dur="12s" repeatCount="indefinite" values="280;450;505;430;300;140;65;115;235;280" />
              <animate attributeName="cy" dur="12s" repeatCount="indefinite" values="72;130;262;404;458;426;262;118;86;72" />
              <animate attributeName="r" dur="12s" repeatCount="indefinite" values="228;252;278;250;224;212;230;258;238;228" />
            </>
          ) : null}
        </radialGradient>

        <radialGradient cx="280" cy="264" gradientUnits="userSpaceOnUse" id={breathingGradient2} r="180">
          <stop offset="0%" stopColor="#ee9dc5" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#c68eea" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#a596f1" stopOpacity="0" />
          {animated ? (
            <>
              <animate attributeName="cx" dur="9.5s" repeatCount="indefinite" values="398;458;390;280;170;96;158;280;398" />
              <animate attributeName="cy" dur="9.5s" repeatCount="indefinite" values="118;248;388;430;388;248;118;96;118" />
              <animate attributeName="r" dur="9.5s" repeatCount="indefinite" values="194;226;212;186;204;228;210;188;194" />
            </>
          ) : null}
        </radialGradient>

        <radialGradient cx="280" cy="264" gradientUnits="userSpaceOnUse" id={breathingGradient3} r="150">
          <stop offset="0%" stopColor="#f4b69d" stopOpacity="0.6" />
          <stop offset="40%" stopColor="#ee9dc5" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#c68eea" stopOpacity="0" />
          {animated ? (
            <>
              <animate attributeName="cx" dur="6.8s" repeatCount="indefinite" values="210;330;394;338;250;166;214;320;210" />
              <animate attributeName="cy" dur="6.8s" repeatCount="indefinite" values="148;170;268;354;392;332;228;166;148" />
              <animate attributeName="r" dur="6.8s" repeatCount="indefinite" values="158;176;194;182;168;178;190;172;158" />
            </>
          ) : null}
        </radialGradient>

        <radialGradient cx="280" cy="264" gradientUnits="userSpaceOnUse" id={breathingGradient4} r="190">
          <stop offset="0%" stopColor="#a596f1" stopOpacity="0.5" />
          <stop offset="50%" stopColor="#ee9dc5" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f4b69d" stopOpacity="0" />
          {animated ? (
            <>
              <animate attributeName="cx" dur="13.5s" repeatCount="indefinite" values="140;86;126;244;390;466;410;296;140" />
              <animate attributeName="cy" dur="13.5s" repeatCount="indefinite" values="136;266;396;454;410;252;108;82;136" />
              <animate attributeName="r" dur="13.5s" repeatCount="indefinite" values="206;238;258;228;204;236;260;224;206" />
            </>
          ) : null}
        </radialGradient>

        <mask id={flowMask}>
          <rect fill="white" height="500" width="560" />
          <circle cx="280" cy="264" fill="black" opacity="0.3" r="150">
            {animated ? (
              <>
                <animate attributeName="cx" dur="9.8s" repeatCount="indefinite" values="280;368;448;340;196;110;196;332;280" />
                <animate attributeName="cy" dur="9.8s" repeatCount="indefinite" values="264;180;266;398;412;264;122;158;264" />
                <animate attributeName="r" dur="9.8s" repeatCount="indefinite" values="150;188;214;186;166;198;176;160;150" />
                <animate attributeName="opacity" dur="9.8s" repeatCount="indefinite" values="0.3;0.48;0.24;0.42;0.28;0.5;0.26;0.38;0.3" />
              </>
            ) : null}
          </circle>
          <circle cx="350" cy="200" fill="black" opacity="0.2" r="100">
            {animated ? (
              <>
                <animate attributeName="cx" dur="11.4s" repeatCount="indefinite" values="402;462;360;238;118;176;314;402" />
                <animate attributeName="cy" dur="11.4s" repeatCount="indefinite" values="150;278;392;414;278;138;104;150" />
                <animate attributeName="r" dur="11.4s" repeatCount="indefinite" values="100;126;118;96;124;110;92;100" />
                <animate attributeName="opacity" dur="11.4s" repeatCount="indefinite" values="0.2;0.34;0.22;0.3;0.18;0.32;0.24;0.2" />
              </>
            ) : null}
          </circle>
          <circle cx="210" cy="320" fill="black" opacity="0.25" r="80">
            {animated ? (
              <>
                <animate attributeName="cx" dur="7.6s" repeatCount="indefinite" values="160;246;364;420;322;186;104;160" />
                <animate attributeName="cy" dur="7.6s" repeatCount="indefinite" values="334;412;360;234;128;112;224;334" />
                <animate attributeName="r" dur="7.6s" repeatCount="indefinite" values="82;98;90;108;88;96;84;82" />
                <animate attributeName="opacity" dur="7.6s" repeatCount="indefinite" values="0.25;0.4;0.24;0.36;0.22;0.34;0.28;0.25" />
              </>
            ) : null}
          </circle>
        </mask>

        <filter id={glow}>
          <feGaussianBlur result="coloredBlur" stdDeviation="3" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g mask={`url(#${flowMask})`}>
        <line className="amanda-logo-line shell" stroke={`url(#${logoGradient})`} x1="280" x2="118" y1="74" y2="181" />
        <line className="amanda-logo-line shell" stroke={`url(#${logoGradient})`} x1="118" x2="118" y1="181" y2="347" />
        <line className="amanda-logo-line shell" stroke={`url(#${logoGradient})`} x1="118" x2="280" y1="347" y2="454" />
        <line className="amanda-logo-line shell" stroke={`url(#${logoGradient})`} x1="280" x2="442" y1="454" y2="347" />
        <line className="amanda-logo-line shell" stroke={`url(#${logoGradient})`} x1="442" x2="442" y1="347" y2="181" />
        <line className="amanda-logo-line shell" stroke={`url(#${logoGradient})`} x1="442" x2="280" y1="181" y2="74" />

        <line className="amanda-logo-line facet" stroke={`url(#${logoGradient})`} x1="118" x2="442" y1="181" y2="181" />
        <line className="amanda-logo-line facet" stroke={`url(#${logoGradient})`} x1="118" x2="442" y1="347" y2="347" />
        <line className="amanda-logo-line facet" stroke={`url(#${logoGradient})`} x1="280" x2="118" y1="74" y2="347" />
        <line className="amanda-logo-line facet" stroke={`url(#${logoGradient})`} x1="280" x2="442" y1="74" y2="347" />
        <line className="amanda-logo-line facet" stroke={`url(#${logoGradient})`} x1="118" x2="280" y1="181" y2="257" />
        <line className="amanda-logo-line facet" stroke={`url(#${logoGradient})`} x1="442" x2="280" y1="181" y2="257" />
        <line className="amanda-logo-line facet" stroke={`url(#${logoGradient})`} x1="118" x2="280" y1="347" y2="257" />
        <line className="amanda-logo-line facet" stroke={`url(#${logoGradient})`} x1="280" x2="442" y1="257" y2="347" />

        <line className="amanda-logo-line secondary" stroke={`url(#${logoGradient})`} x1="280" x2="194" y1="74" y2="193" />
        <line className="amanda-logo-line secondary" stroke={`url(#${logoGradient})`} x1="280" x2="366" y1="74" y2="193" />
        <line className="amanda-logo-line secondary" stroke={`url(#${logoGradient})`} x1="118" x2="194" y1="181" y2="193" />
        <line className="amanda-logo-line secondary" stroke={`url(#${logoGradient})`} x1="442" x2="366" y1="181" y2="193" />
        <line className="amanda-logo-line secondary" stroke={`url(#${logoGradient})`} x1="118" x2="194" y1="347" y2="193" />
        <line className="amanda-logo-line secondary" stroke={`url(#${logoGradient})`} x1="442" x2="366" y1="347" y2="193" />
        <line className="amanda-logo-line secondary" stroke={`url(#${logoGradient})`} x1="194" x2="366" y1="193" y2="193" />
        <line className="amanda-logo-line secondary" stroke={`url(#${logoGradient})`} x1="194" x2="280" y1="193" y2="257" />
        <line className="amanda-logo-line secondary" stroke={`url(#${logoGradient})`} x1="366" x2="280" y1="193" y2="257" />
        <line className="amanda-logo-line secondary" stroke={`url(#${logoGradient})`} x1="194" x2="280" y1="193" y2="454" />
        <line className="amanda-logo-line secondary" stroke={`url(#${logoGradient})`} x1="366" x2="280" y1="193" y2="454" />

        <line className="amanda-logo-line accent" stroke={`url(#${logoGradient})`} x1="280" x2="118" y1="74" y2="347" />
        <line className="amanda-logo-line accent" stroke={`url(#${logoGradient})`} x1="280" x2="442" y1="74" y2="347" />
        <line className="amanda-logo-line crossbar" stroke={`url(#${logoGradient})`} x1="118" x2="280" y1="347" y2="257" />
        <line className="amanda-logo-line crossbar" stroke={`url(#${logoGradient})`} x1="280" x2="442" y1="257" y2="347" />
      </g>

      {animated ? (
        <>
          <g className="breathing-overlay layer1">
            <line className="amanda-logo-line shell" stroke={`url(#${breathingGradient1})`} x1="280" x2="118" y1="74" y2="181" />
            <line className="amanda-logo-line shell" stroke={`url(#${breathingGradient1})`} x1="118" x2="118" y1="181" y2="347" />
            <line className="amanda-logo-line shell" stroke={`url(#${breathingGradient1})`} x1="118" x2="280" y1="347" y2="454" />
            <line className="amanda-logo-line shell" stroke={`url(#${breathingGradient1})`} x1="280" x2="442" y1="454" y2="347" />
            <line className="amanda-logo-line shell" stroke={`url(#${breathingGradient1})`} x1="442" x2="442" y1="347" y2="181" />
            <line className="amanda-logo-line shell" stroke={`url(#${breathingGradient1})`} x1="442" x2="280" y1="181" y2="74" />
            <line className="amanda-logo-line accent" stroke={`url(#${breathingGradient1})`} x1="280" x2="118" y1="74" y2="347" />
            <line className="amanda-logo-line accent" stroke={`url(#${breathingGradient1})`} x1="280" x2="442" y1="74" y2="347" />
          </g>

          <g className="breathing-overlay layer2">
            <line className="amanda-logo-line facet" stroke={`url(#${breathingGradient2})`} x1="118" x2="442" y1="181" y2="181" />
            <line className="amanda-logo-line facet" stroke={`url(#${breathingGradient2})`} x1="118" x2="442" y1="347" y2="347" />
            <line className="amanda-logo-line crossbar" stroke={`url(#${breathingGradient2})`} x1="118" x2="280" y1="347" y2="257" />
            <line className="amanda-logo-line crossbar" stroke={`url(#${breathingGradient2})`} x1="280" x2="442" y1="257" y2="347" />
          </g>

          <g className="breathing-overlay layer3">
            <line className="amanda-logo-line facet" stroke={`url(#${breathingGradient3})`} x1="118" x2="280" y1="347" y2="257" />
            <line className="amanda-logo-line facet" stroke={`url(#${breathingGradient3})`} x1="280" x2="442" y1="257" y2="347" />
            <line className="amanda-logo-line accent" stroke={`url(#${breathingGradient3})`} x1="280" x2="118" y1="74" y2="347" />
            <line className="amanda-logo-line accent" stroke={`url(#${breathingGradient3})`} x1="280" x2="442" y1="74" y2="347" />
          </g>

          <g className="breathing-overlay layer4">
            <line className="amanda-logo-line shell" stroke={`url(#${breathingGradient4})`} x1="280" x2="118" y1="74" y2="181" />
            <line className="amanda-logo-line shell" stroke={`url(#${breathingGradient4})`} x1="118" x2="118" y1="181" y2="347" />
            <line className="amanda-logo-line shell" stroke={`url(#${breathingGradient4})`} x1="118" x2="280" y1="347" y2="454" />
            <line className="amanda-logo-line shell" stroke={`url(#${breathingGradient4})`} x1="280" x2="442" y1="454" y2="347" />
            <line className="amanda-logo-line shell" stroke={`url(#${breathingGradient4})`} x1="442" x2="442" y1="347" y2="181" />
            <line className="amanda-logo-line shell" stroke={`url(#${breathingGradient4})`} x1="442" x2="280" y1="181" y2="74" />
            <line className="amanda-logo-line facet" stroke={`url(#${breathingGradient4})`} x1="118" x2="442" y1="181" y2="181" />
            <line className="amanda-logo-line facet" stroke={`url(#${breathingGradient4})`} x1="118" x2="442" y1="347" y2="347" />
          </g>
        </>
      ) : null}

      <g className="nodes">
        <circle cx="280" cy="74" fill={`url(#${logoGradient})`} filter={`url(#${glow})`} r="8" />
        <circle cx="118" cy="181" fill={`url(#${logoGradient})`} filter={`url(#${glow})`} r="7" />
        <circle cx="118" cy="347" fill={`url(#${logoGradient})`} filter={`url(#${glow})`} r="9" />
        <circle cx="280" cy="257" fill={`url(#${logoGradient})`} filter={`url(#${glow})`} r="7.5" />
        <circle cx="280" cy="454" fill={`url(#${logoGradient})`} filter={`url(#${glow})`} r="7" />
        <circle cx="442" cy="347" fill={`url(#${logoGradient})`} filter={`url(#${glow})`} r="9" />
        <circle cx="442" cy="181" fill={`url(#${logoGradient})`} filter={`url(#${glow})`} r="7" />
      </g>
    </svg>
  );
}
