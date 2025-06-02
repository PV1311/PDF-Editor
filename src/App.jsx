import PDFEditor from './components/PDFEditor'

function App() {
  return (


    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className=" text-center max-w-7xl mx-auto py-6 px-4">
          <h1 className="text-3xl font-bold text-gray-900">PDF Editor</h1>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <PDFEditor />
      </main>
    </div>
  )
}

export default App
