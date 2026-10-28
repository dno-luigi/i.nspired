import { motion, useReducedMotion } from 'framer-motion';

// The site's reveal behaviour: content fades and lifts into place as it scrolls
// into view, once, and holds still if the person asked for reduced motion.
const EASE = [0.22, 1, 0.36, 1];

const TAGS = {
  div: motion.div,
  section: motion.section,
  header: motion.header,
  footer: motion.footer,
  article: motion.article,
  li: motion.li,
  span: motion.span,
  main: motion.main,
  h1: motion.h1,
  h2: motion.h2,
  p: motion.p,
};

export default function Reveal({
  as = 'div',
  y = 24,
  delay = 0,
  duration = 0.7,
  amount = 0.3,
  once = true,
  className,
  children,
  ...rest
}) {
  const reduced = useReducedMotion();
  const Comp = TAGS[as] || motion.div;

  if (reduced) {
    return (
      <Comp data-reveal="" className={className} {...rest}>
        {children}
      </Comp>
    );
  }

  return (
    <Comp
      data-reveal=""
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount, margin: '0px 0px -8% 0px' }}
      transition={{ duration, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </Comp>
  );
}
