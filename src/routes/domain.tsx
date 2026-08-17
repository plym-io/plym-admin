import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowSquareOut,
  CheckCircle,
  Globe,
  Warning,
} from '@phosphor-icons/react';
import { getGuide, getRouting, getStatus } from '@/api/cloud';
import { isApiError } from '@/api/errors';
import {
  describeDestination,
  destinationRequirement,
  parseDestination,
  type Destination,
} from '@/lib/destination';
import type { Gateway, Guide, GuideStrategy, RoutingOptions, TenantStatus } from '@/types/cloud';
import { Page, PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Step, type StepState } from '@/components/cloud/Step';
import { GatewayPicker } from '@/components/cloud/GatewayPicker';
import { ConnectGuide, StrategyChoice } from '@/components/cloud/ConnectGuide';
import { FinishDomain } from '@/components/cloud/FinishDomain';

/** Which stage of the flow the owner is on. */
type Stage = 1 | 2 | 3 | 4;

function stateOf(index: Stage, at: Stage): StepState {
  return at === index ? 'active' : at > index ? 'done' : 'upcoming';
}

/**
 * What the second question turns out to be. The gateway decides which of these
 * the owner is actually looking at, so the heading is not written until it has.
 */
const STAGE_TWO_TITLE = {
  unknown: 'What that address needs',
  apex: 'Pick an address that can work',
  subdomain: 'Add one DNS record',
  gateway: 'What runs that domain today?',
} as const;

/**
 * Connect a domain.
 *
 * The blog already answers on a plym hostname — that is not what this screen is
 * for. This is for putting it on an address the owner owns: `blog.acme.com`, or
 * a folder on the site they already run. So the first question is where they
 * want it, and every payload after that is rendered by the gateway against that
 * answer: which gateways can serve it, the steps for the one they use, snippets
 * with the real hostnames already substituted. Nothing here is guessed locally,
 * and nothing waits on a human at plym — the last step applies the move itself.
 *
 * How many questions that takes depends on the answer to the first one, and the
 * gateway is what says so. A bare subdomain is one DNS record whoever runs the
 * domain — the gateway question has no bearing on the steps, so it isn't asked.
 * A bare domain can't be served at all, and saying that plainly is better than
 * a list of options that are all greyed out.
 */
export default function Domain() {
  const [status, setStatus] = useState<TenantStatus | null>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [current, setCurrent] = useState<RoutingOptions | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);

  const [stage, setStage] = useState<Stage>(1);
  const [address, setAddress] = useState('');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);

  const [routing, setRouting] = useState<RoutingOptions | null>(null);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [gatewayId, setGatewayId] = useState<string | null>(null);
  /** Whether that gateway is the owner's choice or just the recommendation. */
  const [gatewayPicked, setGatewayPicked] = useState(false);
  /**
   * The owner asked to see the gateway catalogue even though the flow did not
   * need it. Never assumed — the shortcuts are only ever shortcuts.
   */
  const [pickerOpen, setPickerOpen] = useState(false);

  const [guide, setGuide] = useState<Guide | null>(null);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [strategyId, setStrategyId] = useState<string | null>(null);

  /* Where the blog sits today. Read once, without a `home`, so it describes
     current state rather than any destination. */
  const loadCurrent = useCallback(() => {
    setLoadingCurrent(true);
    getStatus()
      .then(setStatus)
      .catch(() => {
        /* the routing payload's own placement covers this */
      });
    getRouting()
      .then((r) => {
        setCurrent(r);
        setPlacementError(null);
      })
      .catch((e) =>
        setPlacementError(isApiError(e) ? e.message : 'Could not load your routing options'),
      )
      .finally(() => setLoadingCurrent(false));
  }, []);

  useEffect(loadCurrent, [loadCurrent]);

  const placement = current?.placement;
  // Where readers actually reach it. The origin is the proxy upstream, not an
  // address to advertise, so it is only the fallback.
  const servedAt = placement?.public_url ?? status?.url ?? placement?.origin_url;
  const connected = placement?.external_domain === true;

  // Everything downstream of the address, refetched whenever it changes.
  useEffect(() => {
    if (!destination) return;
    let cancelled = false;
    setRouting(null);
    setRoutingError(null);
    getRouting(destination.url)
      .then((r) => {
        if (cancelled) return;
        setRouting(r);
        // Only preselect what the gateway itself recommends. Guessing on the
        // owner's behalf here means guessing at their infrastructure.
        const rec = r.recommended?.gateway;
        if (rec && r.gateways.some((g) => g.id === rec && g.applicable)) setGatewayId(rec);
      })
      .catch((e) => {
        if (!cancelled) {
          setRoutingError(
            isApiError(e) ? e.message : 'Could not work out how to reach that address',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [destination]);

  /* What the gateway says about the address they asked for — not about where
     the blog sits today. Every branch below reads these rather than working the
     same facts out again from the hostname. */
  const target = routing?.placement?.destination === true ? routing.placement : undefined;
  /** A registrable domain with no label in front: nothing can be pointed at it. */
  const atApex = target?.at_apex === true && target?.at_root === true;
  /** They typed a subdomain, so `subdomain_host` is their address, not our idea. */
  const bareSubdomain = target?.subdomain_requested === true;

  /**
   * The gateway to load steps from when the question isn't worth asking.
   *
   * A bare subdomain resolves to the same one-CNAME recipe everywhere, so this
   * picks among identical answers rather than guessing at anyone's stack — the
   * gateway's own recommendation first, and failing that whichever gateway can
   * actually serve a subdomain.
   */
  const autoGateway: Gateway | null = useMemo(() => {
    if (!routing || !bareSubdomain) return null;
    const rec = routing.gateways.find(
      (g) => g.id === routing.recommended?.gateway && g.applicable,
    );
    return (
      rec ??
      routing.gateways.find(
        (g) => g.applicable && g.strategies.some((s) => s.applicable && s.kind === 'subdomain'),
      ) ??
      null
    );
  }, [routing, bareSubdomain]);

  /** Two stages instead of four: the address, then the record that serves it. */
  const collapsed = bareSubdomain && !pickerOpen && !gatewayPicked && autoGateway !== null;

  /**
   * How many questions this address turns out to need — which only the gateway
   * can say. Until it has, the flow shows that it is still working it out
   * rather than posing a question it may be about to withdraw.
   */
  const flow: 'unknown' | 'apex' | 'subdomain' | 'gateway' = !destination
    ? 'gateway'
    : !routing
      ? 'unknown'
      : atApex
        ? 'apex'
        : collapsed
          ? 'subdomain'
          : 'gateway';
  /** A subdomain has no gateway to choose and nothing to gate behind a button. */
  const showLaterSteps = flow === 'apex' || flow === 'gateway';

  useEffect(() => {
    if (collapsed && autoGateway && gatewayId !== autoGateway.id) setGatewayId(autoGateway.id);
  }, [collapsed, autoGateway, gatewayId]);

  useEffect(() => {
    if (!gatewayId || !destination) return;
    let cancelled = false;
    setGuide(null);
    setGuideError(null);
    getGuide(gatewayId, { home: destination.url })
      .then((g) => {
        if (cancelled) return;
        setGuide(g);
        const preferred = routing?.recommended?.strategy;
        const usable =
          g.strategies.find((s) => s.id === preferred && s.applicable) ??
          g.strategies.find((s) => s.applicable) ??
          g.strategies[0];
        setStrategyId(usable?.id ?? null);
      })
      .catch((e) => {
        if (!cancelled) {
          setGuideError(isApiError(e) ? e.message : 'Could not load the steps for that setup');
        }
      });
    return () => {
      cancelled = true;
    };
    // Keyed on the gateway and the address alone: `routing.recommended` only
    // seeds the initial strategy, and re-running this when it arrives would
    // yank the guide out from under someone already reading it.
  }, [gatewayId, destination, routing?.recommended?.strategy]);

  const submitAddress = (raw: string) => {
    const parsed = parseDestination(raw, placement?.platform_domain);
    if (!parsed.ok) {
      setAddressError(parsed.message);
      return;
    }
    setAddressError(null);
    // A different address invalidates every answer that followed it.
    if (parsed.value.url !== destination?.url) {
      setGatewayId(null);
      setGatewayPicked(false);
      setPickerOpen(false);
      setGuide(null);
      setStrategyId(null);
    }
    setDestination(parsed.value);
    setStage(2);
  };

  const confirmAddress = () => submitAddress(address);

  /** One of the ways out the gateway offered, taken. */
  const useAddress = (next: string) => {
    setAddress(next);
    submitAddress(next);
  };

  const chooseGateway = (id: string) => {
    setGatewayId(id);
    setGatewayPicked(true);
    setStage(3);
  };

  /** Leaves a shortcut for the catalogue, without discarding the address. */
  const openPicker = () => {
    setPickerOpen(true);
    setStage(2);
  };

  const gateway = routing?.gateways.find((g) => g.id === gatewayId) ?? null;
  const applicable = useMemo(
    () => (guide?.strategies ?? []).filter((s) => s.applicable),
    [guide],
  );
  const strategy: GuideStrategy | null =
    guide?.strategies.find((s) => s.id === strategyId) ?? null;

  /** The address the gateway echoed back, which is the one it ruled on. */
  const apexHost = target?.public_host ?? destination?.host ?? '';

  const gatewayPickerBody = !routing ? (
    <div className="space-y-2">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  ) : routing.gateways.length === 0 ? (
    <EmptyState
      icon={Globe}
      title="No setups available."
      hint="This deployment didn’t publish any gateways to connect through."
    />
  ) : (
    <GatewayPicker
      gateways={routing.gateways}
      // The recommendation is marked, never pre-ticked: a card that looks
      // chosen makes the click that confirms it look optional.
      selected={gatewayPicked ? gatewayId : null}
      recommended={routing.recommended?.gateway}
      why={routing.recommended?.why}
      onSelect={chooseGateway}
    />
  );

  const guideBody = (
    <>
      <StrategyChoice strategies={applicable} selected={strategyId} onSelect={setStrategyId} />
      {strategy ? (
        <ConnectGuide strategy={strategy} />
      ) : (
        <p className="text-sm text-fg-muted">
          There is no way to serve that address through {guide?.label} yet.
        </p>
      )}
    </>
  );

  const addressStep = (
    <Step
      index={1}
      state={stateOf(1, stage)}
      title="Where should your blog live?"
      hint="The address you want people to visit."
      summary={
        destination && (
          <>
            <span className="font-mono text-fg">{destination.url}</span>
            <span className="block">{describeDestination(destination)}</span>
          </>
        )
      }
      onReopen={() => setStage(1)}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            if (addressError) setAddressError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && confirmAddress()}
          placeholder="blog.acme.com  or  acme.com/blog"
          aria-label="The address you want your blog to have"
          aria-invalid={Boolean(addressError)}
          autoComplete="off"
          spellCheck={false}
          className="font-mono sm:flex-1"
        />
        <Button variant="accent" onClick={confirmAddress} disabled={!address.trim()}>
          Continue <ArrowRight size={14} />
        </Button>
      </div>
      {addressError ? (
        <p className="mt-2 text-[13px] text-danger">{addressError}</p>
      ) : (
        <LivePreview address={address} platformDomain={placement?.platform_domain} />
      )}
    </Step>
  );

  return (
    <Page width="text">
      <PageHeader title="Your domain" description="Serve this blog on a domain you own." />

      {/* Where it answers today. Stated, not celebrated: it is the starting
          point of this screen, not its destination. */}
      <div className="mt-6 flex items-center gap-4 rounded-xl border border-border bg-bg p-4 shadow-xs">
        <Globe size={20} weight="duotone" className="shrink-0 text-fg-subtle" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-fg-muted">
            {connected ? 'Your blog is served at' : 'Right now your blog answers at'}
          </p>
          {loadingCurrent ? (
            <Skeleton className="mt-1 h-4 w-56" />
          ) : (
            <p className="truncate font-mono text-[13.5px] text-fg">
              {servedAt ?? 'an address we could not read'}
            </p>
          )}
        </div>
        {servedAt && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(servedAt, '_blank', 'noopener')}
          >
            Visit <ArrowSquareOut size={14} />
          </Button>
        )}
      </div>

      {connected && stage === 1 && !destination && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-success/40 bg-success/5 p-4">
          <CheckCircle size={18} weight="fill" className="shrink-0 text-success" />
          <p className="min-w-0 flex-1 text-[13.5px] text-fg-muted">
            That is your own domain — this blog is already connected. You can point it
            somewhere else below.
          </p>
        </div>
      )}

      {placementError ? (
        <div className="mt-8 rounded-lg border border-danger/40 bg-danger/5 p-4">
          <p className="text-sm text-danger">{placementError}</p>
          <Button variant="ghost" className="mt-2" onClick={loadCurrent}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="mt-8">
          {addressStep}

          <Step
            index={2}
            state={stateOf(2, stage)}
            title={STAGE_TWO_TITLE[flow]}
            hint={
              flow === 'subdomain' && destination
                ? `That is the whole setup for ${destination.host} — one record, wherever your DNS lives.`
                : flow === 'gateway' && destination
                  ? `Pick what serves ${destination.host} right now — the steps are written for it.`
                  : undefined
            }
            summary={gateway?.label}
            onReopen={() => setStage(2)}
          >
            {routingError ? (
              <p className="text-sm text-danger">{routingError}</p>
            ) : flow === 'unknown' ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : flow === 'apex' ? (
              <>
                <ApexNotYet
                  host={apexHost}
                  why={routing?.recommended?.why}
                  subdomainHost={target?.subdomain_host}
                  onUse={useAddress}
                />
                {/* Still reachable, just not the first thing offered — the two
                    addresses above are what actually get someone unstuck. */}
                {pickerOpen ? (
                  <div className="mt-6">{gatewayPickerBody}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="mt-4 text-[13px] text-fg-subtle underline-offset-2 transition-colors hover:text-fg hover:underline"
                  >
                    Show the setups anyway
                  </button>
                )}
              </>
            ) : flow === 'subdomain' ? (
              /* One record, and the button that applies it. Every gateway
                 answers a bare subdomain with this same CNAME, so there is no
                 gateway question worth asking and no third page to turn. */
              <>
                {guideError ? (
                  <p className="text-sm text-danger">{guideError}</p>
                ) : !guide ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-40 w-full" />
                  </div>
                ) : (
                  <>
                    {guideBody}
                    {strategy?.applicable && strategy.finish && (
                      <div className="mt-6 border-t border-border pt-6">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                          Once the record is saved
                        </p>
                        <FinishDomain
                          finish={strategy.finish}
                          checks={strategy.checks}
                          prefix={target?.prefix}
                          onApplied={loadCurrent}
                        />
                      </div>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={openPicker}
                  className="mt-6 text-[13px] text-fg-subtle underline-offset-2 transition-colors hover:text-fg hover:underline"
                >
                  My domain sits behind something else — show me the setups
                </button>
              </>
            ) : (
              gatewayPickerBody
            )}
          </Step>

          {showLaterSteps && (
            <>
              <Step
                index={3}
                state={stateOf(3, stage)}
                title={gatewayPicked && gateway ? `Set it up in ${gateway.label}` : 'Set it up'}
                hint={
                  destination ? destinationRequirement(destination) : 'The exact steps for your setup.'
                }
                summary={strategy?.label}
                onReopen={() => setStage(3)}
              >
                {guideError ? (
                  <p className="text-sm text-danger">{guideError}</p>
                ) : !guide ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-40 w-full" />
                  </div>
                ) : (
                  <>
                    {guideBody}
                    {strategy?.applicable && strategy.finish && (
                      <Button variant="accent" className="mt-6" onClick={() => setStage(4)}>
                        I’ve made these changes <ArrowRight size={14} />
                      </Button>
                    )}
                  </>
                )}
              </Step>

              <Step
                index={4}
                state={stateOf(4, stage)}
                title="Go live"
                hint="This is the only step that changes anything."
                onReopen={() => setStage(4)}
              >
                {strategy?.finish ? (
                  <FinishDomain
                    finish={strategy.finish}
                    checks={strategy.checks}
                    prefix={target?.prefix}
                    onApplied={loadCurrent}
                  />
                ) : (
                  <p className="text-sm text-fg-muted">
                    Finish the steps above and this turns into the button that moves your blog.
                  </p>
                )}
              </Step>
            </>
          )}
        </div>
      )}
    </Page>
  );
}

/**
 * A bare domain, turned down — with both ways past it.
 *
 * `acme.com` has no label to hang a CNAME on, so nothing can point it at plym:
 * the gateway blocks every strategy and puts the explanation, and both routes
 * forward, in `recommended.why`. That sentence is the entire content of this
 * screen for someone who typed an apex, so it leads rather than sits under a
 * catalogue of options that are all unavailable. Re-typing the address would
 * otherwise be the only way out, so each route is also one tap.
 */
function ApexNotYet({
  host,
  why,
  subdomainHost,
  onUse,
}: {
  host: string;
  why?: string;
  /** The gateway's own suggestion — never worked out from `host` here. */
  subdomainHost?: string;
  onUse: (address: string) => void;
}) {
  const withPath = `${host}/blog`;
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
      <div className="flex gap-3">
        <Warning size={18} weight="fill" className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-fg">
            <span className="font-mono">{host}</span> can’t point at your blog on its own
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-fg-muted">
            {why ??
              'A domain with nothing in front of it can’t carry the record this needs. Either of these works.'}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="accent" className="max-w-full" onClick={() => onUse(withPath)}>
              <span className="truncate font-mono">{withPath}</span>
              <ArrowRight size={14} className="shrink-0" />
            </Button>
            {subdomainHost && (
              <Button
                variant="secondary"
                className="max-w-full"
                onClick={() => onUse(subdomainHost)}
              >
                <span className="truncate font-mono">{subdomainHost}</span>
                <ArrowRight size={14} className="shrink-0" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Reads back what the owner has typed so far, in words. The difference between
 * a subdomain and a folder on an existing site is the one thing on this screen
 * they have to get right, so it is confirmed while they type rather than three
 * screens later.
 *
 * It describes the address and stops there. Nothing has been asked of the
 * gateway yet, so this is in no position to say whether the address will work.
 */
function LivePreview({
  address,
  platformDomain,
}: {
  address: string;
  platformDomain?: string;
}) {
  const parsed = address.trim() ? parseDestination(address, platformDomain) : null;
  if (!parsed?.ok) {
    return (
      <p className="mt-2 text-[13px] text-fg-subtle">
        A subdomain like <span className="font-mono">blog.acme.com</span>, or a folder like{' '}
        <span className="font-mono">acme.com/blog</span>.
      </p>
    );
  }
  return <p className="mt-2 text-[13px] text-fg-muted">{describeDestination(parsed.value)}</p>;
}
