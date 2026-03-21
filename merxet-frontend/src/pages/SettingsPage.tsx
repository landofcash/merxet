import {ArrowLeft, Bug, ChartNetwork} from 'lucide-react'
import {useEffect, useState} from 'react'
import {Button} from '@/components/ui/button'
import {CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Link} from 'react-router-dom'
import AppShellCard from '@/components/AppShellCard'
import {useWallet} from '@/context/WalletContext'
import {getAvailableNetworkIds} from '@/config'
import {getHcsTopicId} from '@/lib/hedera/hederaUtils'

function SettingsPage() {
  const {network, switchNetwork} = useWallet()
  const availableNetworks = getAvailableNetworkIds()
  const [topicId, setTopicId] = useState<string | null>(null)
  const [topicError, setTopicError] = useState<string | null>(null)
  const [topicLoading, setTopicLoading] = useState(true)

  const labelFor = (id: string) => id.charAt(0).toUpperCase() + id.slice(1)

  useEffect(() => {
    let cancelled = false

    const loadTopicId = async () => {
      setTopicLoading(true)
      setTopicError(null)

      try {
        const resolvedTopicId = await getHcsTopicId(network)
        if (cancelled) {
          return
        }
        setTopicId(resolvedTopicId)
      } catch (error) {
        if (cancelled) {
          return
        }
        setTopicId(null)
        setTopicError(error instanceof Error ? error.message : 'Failed to load topic ID')
      } finally {
        if (!cancelled) {
          setTopicLoading(false)
        }
      }
    }

    void loadTopicId()
    return () => {
      cancelled = true
    }
  }, [network])

  return (
    <div className="w-full flex items-start justify-center px-4 py-8 sm:py-10">
      <AppShellCard className="w-full max-w-md">
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
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div className="text-muted-foreground">On-chain HCS Topic ID</div>
              <div className="break-all font-mono text-foreground">
                {topicLoading ? 'Loading…' : topicId?.trim() ? topicId : (topicError ?? 'Not set on-chain')}
              </div>
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
      </AppShellCard>
    </div>
  )
}

export default SettingsPage
