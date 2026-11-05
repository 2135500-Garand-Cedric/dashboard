export default function AccessDeniedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">Access denied</h1>
        <p>You cannot use this app. It is private and only available to its owner.</p>
        <form action="/api/auth/signin" method="get">
          <button type="submit" className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">Sign in with GitHub</button>
        </form>
      </div>
    </main>
  );
}
