import { useState, useEffect } from "react";

const getViewport = () => ({
  width: typeof window !== "undefined" ? window.innerWidth : 1200,
  isMobile: typeof window !== "undefined" ? window.innerWidth < 768 : false,
  isTablet: typeof window !== "undefined" ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
});

function useViewport() {
  const [viewport, setViewport] = useState(getViewport);

  useEffect(() => {
    const onResize = () => setViewport(getViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return viewport;
}

export default useViewport;
