import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "remotion";

export const productCardSchema = z.object({
  sku: z.string(),
  productName: z.string(),
  tagline: z.string(),
  benefits: z.array(z.string()),
  accentColor: z.string(),
  highlightColor: z.string(),
});

type Props = z.infer<typeof productCardSchema>;

export const ProductCard: React.FC<Props> = ({
  sku,
  productName,
  tagline,
  benefits,
  accentColor,
  highlightColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const logoOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  const titleSpring = spring({
    frame: frame - 25,
    fps,
    config: { damping: 12, stiffness: 90 },
  });
  const titleY = interpolate(titleSpring, [0, 1], [80, 0]);
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  const taglineOpacity = interpolate(frame, [55, 75], [0, 1], {
    extrapolateRight: "clamp",
  });

  const ctaSpring = spring({
    frame: frame - 150,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const ctaScale = interpolate(ctaSpring, [0, 1], [0.6, 1]);
  const ctaOpacity = interpolate(ctaSpring, [0, 1], [0, 1]);

  const fadeOut = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${accentColor} 0%, #1a1a1a 100%)`,
        fontFamily: "system-ui, -apple-system, sans-serif",
        opacity: fadeOut,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 40%, ${highlightColor}33 0%, transparent 60%)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 120,
          width: "100%",
          textAlign: "center",
          opacity: logoOpacity,
          color: highlightColor,
          fontSize: 48,
          letterSpacing: 12,
          fontWeight: 300,
        }}
      >
        DAS EXPERTEN
      </div>

      <div
        style={{
          position: "absolute",
          top: 220,
          width: "100%",
          textAlign: "center",
          opacity: logoOpacity,
          color: "#888",
          fontSize: 28,
          letterSpacing: 8,
        }}
      >
        {sku}
      </div>

      <div
        style={{
          position: "absolute",
          top: 480,
          width: "100%",
          textAlign: "center",
          transform: `translateY(${titleY}px)`,
          opacity: titleOpacity,
          color: "#fff",
          fontSize: 220,
          fontWeight: 800,
          letterSpacing: 4,
        }}
      >
        {productName}
      </div>

      <div
        style={{
          position: "absolute",
          top: 760,
          width: "100%",
          padding: "0 80px",
          textAlign: "center",
          opacity: taglineOpacity,
          color: "#e0e0e0",
          fontSize: 44,
          lineHeight: 1.3,
          fontWeight: 300,
        }}
      >
        {tagline}
      </div>

      <div
        style={{
          position: "absolute",
          top: 1000,
          width: "100%",
          padding: "0 100px",
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        {benefits.map((benefit, i) => {
          const benefitStart = 90 + i * 18;
          const benefitSpring = spring({
            frame: frame - benefitStart,
            fps,
            config: { damping: 14, stiffness: 110 },
          });
          const x = interpolate(benefitSpring, [0, 1], [-200, 0]);
          const opacity = interpolate(benefitSpring, [0, 1], [0, 1]);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                transform: `translateX(${x}px)`,
                opacity,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  background: highlightColor,
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  color: "#fff",
                  fontSize: 42,
                  fontWeight: 400,
                }}
              >
                {benefit}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 220,
          width: "100%",
          textAlign: "center",
          transform: `scale(${ctaScale})`,
          opacity: ctaOpacity,
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "32px 80px",
            background: highlightColor,
            color: accentColor,
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: 4,
            borderRadius: 100,
          }}
        >
          КУПИТЬ НА OZON
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 80,
          width: "100%",
          textAlign: "center",
          opacity: ctaOpacity,
          color: "#666",
          fontSize: 24,
          letterSpacing: 4,
        }}
      >
        dasexperten.com
      </div>
    </AbsoluteFill>
  );
};
