'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import Image, { type ImageProps } from 'next/image';

interface AppImageProps extends Omit<
  ImageProps,
  | 'src'
  | 'alt'
  | 'width'
  | 'height'
  | 'className'
  | 'priority'
  | 'quality'
  | 'placeholder'
  | 'blurDataURL'
  | 'fill'
  | 'sizes'
  | 'onClick'
  | 'loading'
  | 'unoptimized'
> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  quality?: number;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  fill?: boolean;
  sizes?: string;
  onClick?: () => void;
  fallbackSrc?: string;
  loading?: 'lazy' | 'eager';
  unoptimized?: boolean;
}

const AppImage = memo(function AppImage({
  src,
  alt,
  width,
  height,
  className = '',
  priority = false,
  quality = 85,
  placeholder = 'empty',
  blurDataURL,
  fill = false,
  sizes,
  onClick,
  fallbackSrc = '/assets/images/no_image.png',
  loading = 'lazy',
  unoptimized = false,
  style,
  ...props
}: AppImageProps) {
  const [imageSrc, setImageSrc] = useState(src);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const isExternalUrl = useMemo(
    () => typeof imageSrc === 'string' && imageSrc.startsWith('http'),
    [imageSrc]
  );
  const resolvedUnoptimized = unoptimized || isExternalUrl;

  const handleError = useCallback(() => {
    if (!hasError && imageSrc !== fallbackSrc) {
      setImageSrc(fallbackSrc);
      setHasError(true);
    }
    setIsLoading(false);
  }, [hasError, imageSrc, fallbackSrc]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
  }, []);

  const imageClassName = useMemo(() => {
    const classes = [className];
    if (isLoading) classes.push('bg-gray-200');
    if (onClick) classes.push('cursor-pointer hover:opacity-90 transition-opacity duration-200');
    return classes.filter(Boolean).join(' ');
  }, [className, isLoading, onClick]);

  if (fill) {
    return (
      <div className="relative" style={{ width: '100%', height: '100%' }}>
        <Image
          src={imageSrc}
          alt={alt}
          fill
          sizes={sizes || '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'}
          className={imageClassName}
          quality={quality}
          placeholder={placeholder}
          blurDataURL={placeholder === 'blur' ? blurDataURL : undefined}
          priority={priority}
          loading={priority ? undefined : loading}
          unoptimized={resolvedUnoptimized}
          onError={handleError}
          onLoad={handleLoad}
          onClick={onClick}
          style={{ objectFit: 'cover', ...style }}
          {...props}
        />
      </div>
    );
  }

  return (
    <Image
      src={imageSrc}
      alt={alt}
      width={width || 400}
      height={height || 300}
      sizes={sizes}
      className={imageClassName}
      quality={quality}
      placeholder={placeholder}
      blurDataURL={placeholder === 'blur' ? blurDataURL : undefined}
      priority={priority}
      loading={priority ? undefined : loading}
      unoptimized={resolvedUnoptimized}
      onError={handleError}
      onLoad={handleLoad}
      onClick={onClick}
      style={style}
      {...props}
    />
  );
});

AppImage.displayName = 'AppImage';

export default AppImage;
