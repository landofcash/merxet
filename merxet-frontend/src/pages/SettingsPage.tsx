import {ArrowLeft, Bug, ChartNetwork} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Link} from 'react-router-dom'
import {useWallet} from '@/context/WalletContext'
import {getAvailableNetworkIds} from '@/config'

function SettingsPage() {
  const {network, switchNetwork} = useWallet()
  const availableNetworks = getAvailableNetworkIds()

  const labelFor = (id: string) => id.charAt(0).toUpperCase() + id.slice(1)

  return (
    <div className="min-h-screen bg-background flex items-start justify-center px-4 py-8 sm:py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5"/>
            </Button>
          </Link>
          <CardTitle className="text-2xl font-bold">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="items-center gap-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ChartNetwork className="h-4 w-4"/>
              Merxet Network
            </div>
            <div className="flex gap-2 flex-wrap">
              {availableNetworks.map((id) => (
                <Button key={id}
                        variant={network === id ? 'default' : 'outline'}
                        onClick={() => switchNetwork(id)}
                        size="sm">
                  {labelFor(id)}
                </Button>
              ))}
            </div>
          </div>

          {/* Debug Section */}
          <div className="pt-4 border-t space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Bug className="h-4 w-4"/>
              Debug Tools
            </div>
            <div className="space-y-2">
              <Link to="/debug/encrypt" className="block w-full">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  🔐 Test Encryption
                </Button>
              </Link>
              <Link to="/debug/decrypt" className="block w-full">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  🔓 Test Decryption
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default SettingsPage
