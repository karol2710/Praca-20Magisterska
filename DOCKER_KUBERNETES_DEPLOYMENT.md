# Docker and Kubernetes Deployment Guide

This guide provides comprehensive instructions for containerizing and deploying the KubeChart application to a Kubernetes cluster.

## Table of Contents

1. [Docker Setup](#docker-setup)
2. [Building Docker Images](#building-docker-images)
3. [Local Development with Docker Compose](#local-development-with-docker-compose)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [Configuration and Secrets](#configuration-and-secrets)
6. [Deployment Steps](#deployment-steps)
7. [Monitoring and Troubleshooting](#monitoring-and-troubleshooting)

---

## Docker Setup

### Prerequisites

- Docker 20.10+ installed
- Docker Hub or private container registry access
- pnpm 10.14.0+ (for local development)

### Dockerfile Overview

The application uses a multi-stage Dockerfile for optimal production builds:

**Build Stage:**
- Uses `node:22-alpine` as the base image
- Installs build dependencies (python3, make, g++)
- Installs pnpm package manager
- Installs all dependencies from `pnpm-lock.yaml`
- Builds both client and server using Vite

**Production Stage:**
- Uses lightweight `node:22-alpine` base
- Copies only necessary artifacts from build stage
- Installs production dependencies only
- Creates non-root user (nodejs) for security
- Exposes port 3000
- Includes health check endpoint

### Image Size Optimization

- **Build stage**: ~800MB (temporary)
- **Final image**: ~200MB (optimized for production)

---

## Building Docker Images

### 1. Build Locally

```bash
# Build the Docker image
docker build -t kubechart:latest .

# Build with custom tag
docker build -t your-registry/kubechart:v1.0.0 .
```

### 2. Build for Multiple Architectures

```bash
# Requires buildx (multi-architecture support)
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t your-registry/kubechart:latest \
  --push .
```

### 3. Push to Registry

```bash
# Tag the image
docker tag kubechart:latest your-registry/kubechart:latest

# Push to registry
docker push your-registry/kubechart:latest
```

---

## Local Development with Docker Compose

### Quick Start

```bash
# Start all services (PostgreSQL + App)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop all services
docker-compose down
```

### Services

- **postgres**: PostgreSQL 16 database
  - User: `kubechart`
  - Password: `kubechart_dev_password`
  - Database: `kubechart_dev`
  - Port: `5432`

- **app**: KubeChart application
  - Port: `3000`
  - Auto-connects to PostgreSQL
  - Database URL: `postgresql://kubechart:kubechart_dev_password@postgres:5432/kubechart_dev`

### Environment Variables

```env
NODE_ENV=development
DATABASE_URL=postgresql://kubechart:kubechart_dev_password@postgres:5432/kubechart_dev
JWT_SECRET=your-development-secret-key-change-this
PORT=3000
```

### Database Access

```bash
# Connect to PostgreSQL directly
docker-compose exec postgres psql -U kubechart -d kubechart_dev

# View app logs
docker-compose logs app

# Restart services
docker-compose restart app
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster 1.24+ (EKS, GKE, AKS, or local kind/minikube)
- kubectl configured to access your cluster
- Container registry access (Docker Hub, ECR, GCR, etc.)
- (Optional) cert-manager for TLS certificates
- (Optional) nginx-ingress controller

### Architecture Overview

The Kubernetes deployment includes:

```
┌─────────────────────────────────────────┐
│     Kubernetes Cluster                  │
├─────────────────────────────────────────┤
│  Namespace: kubechart                   │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ Ingress (kubechart.example.com)  │   │
│  └────────┬─────────────────────────┘   │
│           │                             │
│  ┌────────▼──────────────────────────┐  │
│  │ Service (kubechart)               │  │
│  │ Type: ClusterIP / LoadBalancer    │  │
│  └────────┬──────────────────────────┘  │
│           │                             │
│  ┌────────▼──────────────────────────┐  │
│  │ Deployment (kubechart)            │  │
│  │ Replicas: 3-10 (HPA enabled)      │  │
│  │                                   │  │
│  │  ┌──────────────────────────────┐ │  │
│  │  │ Pod 1 (kubechart container)  │ │  │
│  │  └──────────────────────────────┘ │  │
│  │  ┌──────────────────────────────┐ │  │
│  │  │ Pod 2 (kubechart container)  │ │  │
│  │  └──────────────────────────────┘ │  │
│  │  ┌──────────────────────────────┐ │  │
│  │  │ Pod 3 (kubechart container)  │ │  │
│  │  └──────────────────────────────┘ │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ConfigMap: kubechart-config            │
│  Secret: kubechart-secrets              │
│  ServiceAccount: kubechart              │
│  NetworkPolicy: kubechart-*             │
│                                         │
└─────────────────────────────────────────┘
```

### Kubernetes Manifests

All manifests are located in the `kubernetes/` directory:

- **namespace.yaml**: Creates the `kubechart` namespace
- **configmap.yaml**: Application configuration (environment variables)
- **secret.yaml**: Sensitive data (database URL, JWT secret)
- **serviceaccount.yaml**: Service account and RBAC permissions
- **deployment.yaml**: Main application deployment (3 replicas)
- **service.yaml**: ClusterIP and LoadBalancer services
- **ingress.yaml**: HTTP routing with TLS support
- **hpa.yaml**: Horizontal Pod Autoscaler (3-10 replicas based on CPU/Memory)
- **network-policy.yaml**: Network security policies
- **kustomization.yaml**: Kustomize configuration for simplified management

---

## Configuration and Secrets

### ConfigMap (Non-sensitive configuration)

```yaml
# kubernetes/configmap.yaml
NODE_ENV: "production"
PORT: "3000"
LOG_LEVEL: "info"
```

### Secret (Sensitive data)

```yaml
# kubernetes/secret.yaml
DATABASE_URL: "postgresql://user:password@postgres.example.com/kubechart"
JWT_SECRET: "your-secure-jwt-secret-key"
```

### Managing Secrets Securely

**Option 1: Manual Secret Creation**

```bash
# Create secret from command line
kubectl create secret generic kubechart-secrets \
  --from-literal=DATABASE_URL="postgresql://..." \
  --from-literal=JWT_SECRET="your-secret" \
  -n kubechart
```

**Option 2: File-based Secret**

```bash
# Create from environment file
kubectl create secret generic kubechart-secrets \
  --from-env-file=kubernetes/secrets.env \
  -n kubechart
```

**Option 3: Sealed Secrets (Recommended for GitOps)**

```bash
# Install sealed-secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.18.0/controller.yaml

# Create sealed secret
echo -n "your-database-url" | kubectl create secret generic kubechart-secrets \
  --dry-run=client \
  --from-file=DATABASE_URL=/dev/stdin \
  -n kubechart -o yaml | \
  kubeseal -f - > kubernetes/sealed-secret.yaml

# Apply sealed secret
kubectl apply -f kubernetes/sealed-secret.yaml
```

**Option 4: External Secrets Operator**

For advanced GitOps workflows, use External Secrets Operator to fetch secrets from:
- AWS Secrets Manager
- HashiCorp Vault
- Azure Key Vault
- Google Secret Manager

---

## Deployment Steps

### Step 1: Prepare Your Environment

```bash
# 1. Update container registry information
# Edit kubernetes/deployment.yaml and update:
#   image: your-registry/kubechart:latest
#   imagePullPolicy: IfNotPresent

# 2. Update secrets
# Edit kubernetes/secret.yaml with your actual values:
#   DATABASE_URL: "postgresql://user:password@db-host:5432/kubechart"
#   JWT_SECRET: "generate-a-secure-random-string"

# 3. Update ingress domain
# Edit kubernetes/ingress.yaml and update:
#   - kubechart.example.com
```

### Step 2: Build and Push Docker Image

```bash
# Build image
docker build -t your-registry/kubechart:v1.0.0 .

# Push to registry
docker push your-registry/kubechart:v1.0.0

# Update deployment.yaml image tag if different
```

### Step 3: Deploy to Kubernetes

**Option A: Using kubectl with individual manifests**

```bash
# Create namespace
kubectl apply -f kubernetes/namespace.yaml

# Create config and secrets
kubectl apply -f kubernetes/configmap.yaml
kubectl apply -f kubernetes/secret.yaml

# Create RBAC
kubectl apply -f kubernetes/serviceaccount.yaml

# Create network policies
kubectl apply -f kubernetes/network-policy.yaml

# Deploy application
kubectl apply -f kubernetes/deployment.yaml
kubectl apply -f kubernetes/service.yaml

# Deploy ingress (requires ingress controller)
kubectl apply -f kubernetes/ingress.yaml

# Deploy autoscaler
kubectl apply -f kubernetes/hpa.yaml
```

**Option B: Using Kustomize (Recommended)**

```bash
# Apply all manifests using Kustomize
kubectl apply -k kubernetes/

# Or with dry-run to preview changes
kubectl apply -k kubernetes/ --dry-run=client
```

**Option C: Using Helm (Create a Helm Chart)**

```bash
# Structure for Helm chart
helm/kubechart/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   └── ingress.yaml

# Deploy with Helm
helm install kubechart ./helm/kubechart \
  --namespace kubechart \
  --create-namespace \
  --values values-prod.yaml
```

### Step 4: Verify Deployment

```bash
# Check namespace
kubectl get namespace kubechart

# Check deployment
kubectl get deployment -n kubechart

# Check pods
kubectl get pods -n kubechart

# Check services
kubectl get svc -n kubechart

# Check ingress
kubectl get ingress -n kubechart

# View pod logs
kubectl logs -n kubechart -l app=kubechart

# Follow logs in real-time
kubectl logs -f -n kubechart -l app=kubechart

# Describe deployment for events
kubectl describe deployment -n kubechart kubechart
```

### Step 5: Access the Application

**Via LoadBalancer:**

```bash
# Get LoadBalancer IP/hostname
kubectl get svc kubechart-lb -n kubechart

# Once external IP is assigned, access at:
# http://<EXTERNAL-IP>
```

**Via Ingress:**

```bash
# Update your DNS to point kubechart.example.com to ingress IP
kubectl get ingress -n kubechart

# Access at: https://kubechart.example.com
```

**Via Port Forwarding (Development):**

```bash
# Forward port
kubectl port-forward -n kubechart svc/kubechart 3000:80

# Access at: http://localhost:3000
```

---

## Monitoring and Troubleshooting

### Pod Status Checks

```bash
# Check pod status
kubectl get pods -n kubechart

# View pod details
kubectl describe pod -n kubechart <pod-name>

# View container logs
kubectl logs -n kubechart <pod-name>

# View previous logs (if pod crashed)
kubectl logs -n kubechart <pod-name> --previous

# Execute command in pod
kubectl exec -it -n kubechart <pod-name> -- /bin/sh
```

### Common Issues and Solutions

**Issue: Pod in CrashLoopBackOff**

```bash
# Check logs for errors
kubectl logs -n kubechart <pod-name>

# Verify environment variables
kubectl get configmap -n kubechart kubechart-config -o yaml
kubectl get secret -n kubechart kubechart-secrets -o yaml

# Check resource limits
kubectl describe pod -n kubechart <pod-name> | grep -A 5 "Limits\|Requests"
```

**Issue: ImagePullBackOff**

```bash
# Verify image exists in registry
docker pull your-registry/kubechart:latest

# Check image pull secrets (if using private registry)
kubectl get secret -n kubechart

# Add image pull secret if needed
kubectl create secret docker-registry regcred \
  --docker-server=your-registry \
  --docker-username=username \
  --docker-password=password \
  -n kubechart
```

**Issue: Pod Pending**

```bash
# Check resource availability
kubectl top nodes
kubectl describe nodes

# Check PVC status (if using persistent volumes)
kubectl get pvc -n kubechart

# Check node selector or affinity rules
kubectl describe pod -n kubechart <pod-name>
```

**Issue: Service Not Accessible**

```bash
# Check service endpoints
kubectl get endpoints -n kubechart

# Test service connectivity
kubectl run -it --rm debug --image=busybox --restart=Never -- wget -O- http://kubechart.kubechart.svc.cluster.local

# Check network policies
kubectl get networkpolicy -n kubechart

# Check ingress status
kubectl describe ingress -n kubechart kubechart
```

### Logs and Monitoring

```bash
# View logs for all pods
kubectl logs -n kubechart -l app=kubechart --all-containers=true

# Stream logs from all pods
kubectl logs -f -n kubechart -l app=kubechart --all-containers=true

# Export logs
kubectl logs -n kubechart -l app=kubechart > logs.txt

# Monitor resource usage
kubectl top pods -n kubechart

# Watch deployment rollout
kubectl rollout status deployment/kubechart -n kubechart

# View deployment history
kubectl rollout history deployment/kubechart -n kubechart

# Rollback to previous version
kubectl rollout undo deployment/kubechart -n kubechart
```

### Health Checks

The deployment includes:

- **Liveness Probe**: Checks if container is alive (restarts if failed)
  - Path: `/api/ping`
  - Initial Delay: 30s
  - Period: 10s

- **Readiness Probe**: Checks if container is ready to serve traffic
  - Path: `/api/ping`
  - Initial Delay: 10s
  - Period: 5s

- **Startup Probe** (Optional): Checks if application has started
  - Can be added for slower startup times

### Metrics and Scaling

```bash
# View HPA status
kubectl get hpa -n kubechart

# View HPA detailed status
kubectl describe hpa -n kubechart kubechart

# Manual scaling
kubectl scale deployment kubechart --replicas=5 -n kubechart

# Watch HPA scaling
kubectl get hpa -n kubechart -w
```

---

## Advanced Configuration

### Database Connection

For PostgreSQL or other external databases:

```bash
# Update secret with actual database URL
kubectl patch secret kubechart-secrets -n kubechart \
  -p '{"data":{"DATABASE_URL":"postgresql://user:pass@host:5432/db"}}'
```

### TLS/HTTPS

For HTTPS with cert-manager:

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer (Let's Encrypt)
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### Custom Domain

Update ingress.yaml with your domain:

```yaml
rules:
  - host: your-domain.com
    http:
      paths:
        - path: /
          pathType: Prefix
          backend:
            service:
              name: kubechart
              port:
                name: http
```

### Resource Management

Adjust CPU/Memory requests and limits in `kubernetes/deployment.yaml`:

```yaml
resources:
  requests:
    cpu: 250m        # Minimum CPU
    memory: 512Mi    # Minimum Memory
  limits:
    cpu: 500m        # Maximum CPU
    memory: 1Gi      # Maximum Memory
```

### Horizontal Pod Autoscaler

HPA automatically scales pods based on metrics:

```yaml
minReplicas: 3              # Minimum pods
maxReplicas: 10             # Maximum pods
targetCPUUtilizationPercentage: 70
targetMemoryUtilizationPercentage: 80
```

---

## Cleanup

```bash
# Delete entire namespace (deletes all resources)
kubectl delete namespace kubechart

# Delete specific resources
kubectl delete deployment kubechart -n kubechart
kubectl delete service kubechart -n kubechart
kubectl delete secret kubechart-secrets -n kubechart
kubectl delete configmap kubechart-config -n kubechart

# Delete with Kustomize
kubectl delete -k kubernetes/
```

---

## Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Docker Documentation](https://docs.docker.com/)
- [Kustomize](https://kustomize.io/)
- [Helm Package Manager](https://helm.sh/)
- [cert-manager](https://cert-manager.io/)
- [nginx-ingress](https://kubernetes.github.io/ingress-nginx/)
