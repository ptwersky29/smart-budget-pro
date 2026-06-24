import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { useSwipe } from "../hooks/useSwipe";

function SwipeTest({ onLeft, onRight, threshold }) {
  const handlers = useSwipe(onLeft, onRight, threshold);
  return <div data-testid="swipe-area" {...handlers} />;
}

test("calls onSwipeLeft when swiping left past threshold", () => {
  const onLeft = jest.fn();
  const onRight = jest.fn();
  const { getByTestId } = render(<SwipeTest onLeft={onLeft} onRight={onRight} threshold={60} />);
  const el = getByTestId("swipe-area");
  fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 100, clientY: 100 }] });
  expect(onLeft).toHaveBeenCalledTimes(1);
  expect(onRight).not.toHaveBeenCalled();
});

test("calls onSwipeRight when swiping right past threshold", () => {
  const onLeft = jest.fn();
  const onRight = jest.fn();
  const { getByTestId } = render(<SwipeTest onLeft={onLeft} onRight={onRight} threshold={60} />);
  const el = getByTestId("swipe-area");
  fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 100 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200, clientY: 100 }] });
  expect(onRight).toHaveBeenCalledTimes(1);
  expect(onLeft).not.toHaveBeenCalled();
});

test("does not call handlers when swipe is below threshold", () => {
  const onLeft = jest.fn();
  const onRight = jest.fn();
  const { getByTestId } = render(<SwipeTest onLeft={onLeft} onRight={onRight} threshold={60} />);
  const el = getByTestId("swipe-area");
  fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 100 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 130, clientY: 100 }] });
  expect(onLeft).not.toHaveBeenCalled();
  expect(onRight).not.toHaveBeenCalled();
});

test("does not call handlers for vertical swipe", () => {
  const onLeft = jest.fn();
  const onRight = jest.fn();
  const { getByTestId } = render(<SwipeTest onLeft={onLeft} onRight={onRight} threshold={60} />);
  const el = getByTestId("swipe-area");
  fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 100 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 100, clientY: 300 }] });
  expect(onLeft).not.toHaveBeenCalled();
  expect(onRight).not.toHaveBeenCalled();
});

test("uses custom threshold", () => {
  const onLeft = jest.fn();
  const { getByTestId } = render(<SwipeTest onLeft={onLeft} threshold={150} />);
  const el = getByTestId("swipe-area");
  fireEvent.touchStart(el, { touches: [{ clientX: 300, clientY: 100 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200, clientY: 100 }] });
  expect(onLeft).not.toHaveBeenCalled();
  fireEvent.touchStart(el, { touches: [{ clientX: 300, clientY: 100 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 100, clientY: 100 }] });
  expect(onLeft).toHaveBeenCalledTimes(1);
});

test("handles null callbacks gracefully", () => {
  const { getByTestId } = render(<SwipeTest />);
  const el = getByTestId("swipe-area");
  fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 100, clientY: 100 }] });
});
