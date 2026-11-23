import React from "react";
import { Composition } from "remotion";
import { Film, filmDuration } from "./Film";

export const Root = () => (
  <Composition id="Film" component={Film} durationInFrames={filmDuration()} fps={30} width={1920} height={1080} />
);
