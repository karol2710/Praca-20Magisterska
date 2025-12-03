# Envoy Gateway Integration Guide

## Overview

KubeChart is now integrated with **Envoy Gateway**, a modern, lightweight API Gateway built on Envoy Proxy. This integration replaces the traditional NGINX Ingress configuration with Envoy Gateway's more flexible and powerful Gateway API.

## Architecture

### Components

1. **GatewayClass** (`platform-envoy`)
   - Defines the gateway implementation class
   - Managed by Envoy Gateway controller
   - Namespace: `envoy-gateway-system`

2. **Gateway** (`platform-gateway`)
   - Represents the load balancer instance
   - Listens on HTTP (80) and HTTPS (443)
   - Namespace: `envoy-gateway-system`

3. **HTTPRoute** (`kubechart`)
   - Routes traffic from the gateway to KubeChart service
   - Matches hostnames and paths
   - Namespace: `kubechart`

### Traffic Flow

```
Internet Traffic
    ↓
Envoy Gateway (port 80/443)
    ↓
HTTPRoute (kubechart)
    ↓
Service (kubechart)
    ↓
Deployment Pods
```

## File Structure

```
kubernetes/
├── gateway.yaml          # GatewayClass and Gateway definitions (provided)
├── httproute.yaml        # HTTPRoute for KubeChart (auto-created)
├── service.yaml          # Service definitions (existing)
├── deployment.yaml       # Deployment definition (existing)
├── kustomization.yaml    # Kustomize configuration (updated)
└── ...                   # Other Kubernetes resources
```

## HTTPRoute Configuration

The `httproute.yaml` file defines:

- **Parent References**: Links to the `platform-gateway` in `envoy-gateway-system`
- **Hostnames**: 
  - `kubechart.example.com` (primary)
  - `*.kubechart.example.com` (wildcard)
- **Rules**: Routes all traffic (`/`) to the `kubechart` service on port 80
- **Backend References**: Points to the ClusterIP service

## Deployment Steps

### 1. Install Envoy Gateway (if not already installed)

```bash
kubectl apply -f https://github.com/envoyproxy/gateway/releases/download/v1.0.0/install.yaml
```

### 2. Create the Gateway Configuration

```bash
# Save the gateway.yaml provided and apply it
kubectl apply -f gateway.yaml
```

### 3. Deploy KubeChart with HTTPRoute

```bash
# Using Kustomize (includes HTTPRoute)
kubectl apply -k kubernetes/

# Or using individual files
kubectl apply -f kubernetes/namespace.yaml
kubectl apply -f kubernetes/configmap.yaml
kubectl apply -f kubernetes/secret.yaml
kubectl apply -f kubernetes/deployment.yaml
kubectl apply -f kubernetes/service.yaml
kubectl apply -f kubernetes/httproute.yaml
```

### 4. Verify the Deployment

```bash
# Check Gateway status
kubectl get gateway -n envoy-gateway-system
kubectl describe gateway platform-gateway -n envoy-gateway-system

# Check HTTPRoute status
kubectl get httproute -n kubechart
kubectl describe httproute kubechart -n kubechart

# Check Service
kubectl get svc -n kubechart

# Check Pods
kubectl get pods -n kubechart
```

## Configuration Details

### HTTPRoute Specification

```yaml
spec:
  parentRefs:
    - name: platform-gateway
      namespace: envoy-gateway-system
      kind: Gateway
      port: 80
    - name: platform-gateway
      namespace: envoy-gateway-system
      kind: Gateway
      port: 443
```

This configuration:
- References the Envoy Gateway from the `envoy-gateway-system` namespace
- Listens on both HTTP (80) and HTTPS (443) ports
- Ensures traffic is routed through the gateway listeners

### Service Backend

```yaml
backendRefs:
  - name: kubechart
    port: 80
    kind: Service
    weight: 100
```

The HTTPRoute points to:
- Service name: `kubechart`
- Target port: `80` (matches the Service definition)
- Namespace: `kubechart` (inherited from HTTPRoute)

## DNS Configuration

Update your DNS records to point to the Envoy Gateway IP:

```bash
# Get the Gateway's external IP
kubectl get svc -n envoy-gateway-system
kubectl get svc -A | grep envoy

# The external IP becomes your DNS target for:
# kubechart.example.com
# *.kubechart.example.com
```

## TLS/HTTPS Configuration

For HTTPS support with Envoy Gateway:

### Option 1: Gateway-level TLS

Update `gateway.yaml` to include TLS certificates:

```yaml
listeners:
  - name: https
    protocol: HTTPS
    port: 443
    tls:
      mode: Terminate
      certificateRefs:
        - name: kubechart-tls
          kind: Secret
          namespace: kubechart
```

### Option 2: HTTPRoute-level TLS

Update `httproute.yaml`:

```yaml
spec:
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      filters:
        - type: RequestHeaderModifier
          requestHeaderModifier:
            add:
              x-forwarded-proto: https
      backendRefs:
        - name: kubechart
          port: 80
```

## Comparison: Ingress vs HTTPRoute

| Feature | Ingress | HTTPRoute |
|---------|---------|-----------|
| API Group | `networking.k8s.io` | `gateway.networking.k8s.io` |
| Gateway Control | Controller-specific | Standardized (Gateway API) |
| Load Balancer Type | Ingress Controller | Gateway Implementation |
| Flexibility | Limited | More powerful |
| Future-proof | Legacy | Standard (Kubernetes GA) |
| Multi-Tenancy | Limited | Better support |

## Troubleshooting

### HTTPRoute not recognized

```bash
# Verify CRD is installed
kubectl get crd | grep gateway

# Check if gateway.networking.k8s.io APIs are available
kubectl api-resources | grep gateway
```

### Traffic not routing

```bash
# Check HTTPRoute status
kubectl get httproute kubechart -n kubechart -o yaml

# Check Gateway status and listeners
kubectl describe gateway platform-gateway -n envoy-gateway-system

# Check Service and endpoints
kubectl get endpoints -n kubechart

# Check Envoy Gateway logs
kubectl logs -n envoy-gateway-system -l app=envoy-gateway
```

### DNS resolution issues

```bash
# Verify gateway IP
kubectl get svc -n envoy-gateway-system

# Test DNS (from a pod)
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup kubechart.example.com
```

## Migration from Ingress

The existing `ingress.yaml` is retained for backward compatibility but is superseded by `httproute.yaml`. You can:

1. **Keep both** for gradual migration
2. **Replace Ingress** by removing the ingress.yaml from kustomization.yaml
3. **Remove the LoadBalancer Service** (kubechart-lb) if using Envoy Gateway exclusively

To remove Ingress and LoadBalancer:

```bash
# Remove from kustomization.yaml
# - ingress.yaml

# Delete the LoadBalancer service
kubectl delete svc kubechart-lb -n kubechart
```

## Advanced Features

### Request Routing with HTTPRoute

Add path-based or header-based routing:

```yaml
rules:
  - matches:
      - path:
          type: PathPrefix
          value: /api
      - headers:
          - name: X-Version
            value: v2
    backendRefs:
      - name: kubechart-v2
        port: 80

  - matches:
      - path:
          type: PathPrefix
          value: /
    backendRefs:
      - name: kubechart
        port: 80
```

### Traffic Weights

For canary deployments:

```yaml
rules:
  - matches:
      - path:
          type: PathPrefix
          value: /
    backendRefs:
      - name: kubechart-v1
        port: 80
        weight: 90
      - name: kubechart-v2
        port: 80
        weight: 10
```

## Resource Cleanup

To remove Envoy Gateway integration:

```bash
# Delete HTTPRoute
kubectl delete httproute kubechart -n kubechart

# Delete Gateway (if not used by other services)
kubectl delete gateway platform-gateway -n envoy-gateway-system

# Delete GatewayClass (if not used)
kubectl delete gatewayclass platform-envoy

# Uninstall Envoy Gateway (optional)
kubectl delete -f https://github.com/envoyproxy/gateway/releases/download/v1.0.0/install.yaml
```

## References

- [Envoy Gateway Official Documentation](https://gateway.envoyproxy.io/)
- [Kubernetes Gateway API](https://gateway.networking.k8s.io/)
- [HTTPRoute API Reference](https://gateway.networking.k8s.io/docs/api-types/httproute/)
- [Envoy Proxy Documentation](https://www.envoyproxy.io/docs)

## Summary

KubeChart now supports Envoy Gateway, providing:

- ✅ Modern Gateway API standard
- ✅ More flexible traffic routing
- ✅ Better multi-tenancy support
- ✅ Future-proof deployment
- ✅ Enhanced observability through Envoy
- ✅ Advanced traffic management capabilities

Deploy using the `kubectl apply -k kubernetes/` command to include both Ingress (for backward compatibility) and HTTPRoute (for Envoy Gateway).
