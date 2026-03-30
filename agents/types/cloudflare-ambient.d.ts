interface Queue<Body = unknown> {
  send?(message: Body): Promise<void>;
}
