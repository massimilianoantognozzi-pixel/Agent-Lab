import { useEffect, useState } from 'react';

export const useTypingAnimation = (text: string, typingSpeed: number = 60, pauseDuration: number = 3000) => {
  const [frame, setFrame] = useState({ source: text, value: '' });

  useEffect(() => {
    if (!text) {
      return;
    }
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    const restart = () => {
      index = 0;
      setFrame({ source: text, value: '' });
      timer = setTimeout(typeNext, typingSpeed);
    };
    const typeNext = () => {
      index++;
      setFrame({ source: text, value: text.slice(0, index) });
      timer = setTimeout(index >= text.length ? restart : typeNext, index >= text.length ? pauseDuration + typingSpeed : typingSpeed);
    };
    timer = setTimeout(typeNext, typingSpeed);
    return () => clearTimeout(timer);
  }, [text, typingSpeed, pauseDuration]);

  return frame.source === text ? frame.value : '';
};
