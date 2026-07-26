import React from "react";

interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  size?: number | string;
}

export const SendStreakLogo: React.FC<LogoProps> = ({ size, className, style, ...props }) => {
  const pixelSize = size ? (typeof size === "number" ? `${size}px` : size) : undefined;
  
  return (
    <img
      src="/logo.png"
      alt="SendStreak Logo"
      style={{
        width: pixelSize,
        height: pixelSize,
        objectFit: "contain",
        ...style
      }}
      className={className}
      referrerPolicy="no-referrer"
      {...props}
    />
  );
};
