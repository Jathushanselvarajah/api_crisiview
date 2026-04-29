pipeline {
    agent {
        label 'agent1'
    }

    parameters {
        string(name: 'GIT_BRANCH', defaultValue: 'main', description: 'Branch to build')
        string(name: 'BACKEND_HOST', defaultValue: '192.168.64.8', description: 'UTM backend VM IP')
        string(name: 'BACKEND_USER', defaultValue: 'user', description: 'SSH user for backend VM')
        string(name: 'REMOTE_APP_DIR', defaultValue: '/home/user/crisisview-api', description: 'Remote deployment directory')
        string(name: 'BACKEND_IMAGE', defaultValue: 'jathus/crisisview-api', description: 'Docker Hub backend image')
        string(name: 'DOCKERHUB_CREDENTIALS_ID', defaultValue: 'dockerhub-credentials', description: 'Jenkins Docker Hub credentials ID')
        string(name: 'SSH_CREDENTIALS_ID', defaultValue: 'utm-ssh-key', description: 'Jenkins SSH credentials ID')
        string(name: 'SONAR_HOST_URL', defaultValue: 'http://sonarqube:9000', description: 'SonarQube URL from Jenkins network')
        string(name: 'SONAR_TOKEN_CREDENTIALS_ID', defaultValue: 'sonarqube-token', description: 'Jenkins SonarQube token credentials ID')
        booleanParam(name: 'RUN_SEED', defaultValue: true, description: 'Seed staging database after deploy')
    }

    environment {
        TEST_DB_CONTAINER = "crisisview-api-test-db-${BUILD_NUMBER}"
        TEST_DB_NAME = 'incident_test'
        MYSQL_ROOT_PASSWORD = 'root'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Start Test Database') {
            steps {
                sh '''
                    docker rm -f "$TEST_DB_CONTAINER" 2>/dev/null || true
                    docker run -d \
                      --name "$TEST_DB_CONTAINER" \
                      --network jenkins-sonar \
                      -e MYSQL_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD" \
                      -e MYSQL_DATABASE="$TEST_DB_NAME" \
                      mysql:8.4.8

                    for i in $(seq 1 60); do
                      if docker exec "$TEST_DB_CONTAINER" mysqladmin ping -uroot -p"$MYSQL_ROOT_PASSWORD" --silent; then
                        exit 0
                      fi
                      sleep 2
                    done

                    docker logs "$TEST_DB_CONTAINER"
                    exit 1
                '''
            }
        }

        stage('Automated Tests') {
            steps {
                withEnv([
                    "DB_NAME=${env.TEST_DB_NAME}",
                    'DB_USER=root',
                    "DB_PASSWORD=${env.MYSQL_ROOT_PASSWORD}",
                    "DB_HOST=${env.TEST_DB_CONTAINER}",
                    'DB_PORT=3306'
                ]) {
                    sh 'npm test'
                }
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withCredentials([string(credentialsId: params.SONAR_TOKEN_CREDENTIALS_ID, variable: 'SONAR_TOKEN')]) {
                    sh '''
                        sonar-scanner \
                          -Dsonar.host.url="$SONAR_HOST_URL" \
                          -Dsonar.token="$SONAR_TOKEN"
                    '''
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                sh '''
                    docker build \
                      -t "$BACKEND_IMAGE:$BUILD_NUMBER" \
                      -t "$BACKEND_IMAGE:latest" \
                      .
                '''
            }
        }

        stage('Push Docker Image') {
            steps {
                withCredentials([usernamePassword(credentialsId: params.DOCKERHUB_CREDENTIALS_ID, usernameVariable: 'DOCKERHUB_USER', passwordVariable: 'DOCKERHUB_TOKEN')]) {
                    sh '''
                        echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USER" --password-stdin
                        docker push "$BACKEND_IMAGE:$BUILD_NUMBER"
                        docker push "$BACKEND_IMAGE:latest"
                        docker logout
                    '''
                }
            }
        }

        stage('Deploy To UTM Backend') {
            steps {
                sshagent(credentials: [params.SSH_CREDENTIALS_ID]) {
                    sh '''
                        ssh -o StrictHostKeyChecking=accept-new "$BACKEND_USER@$BACKEND_HOST" "mkdir -p '$REMOTE_APP_DIR'"

                        ssh "$BACKEND_USER@$BACKEND_HOST" "cat > '$REMOTE_APP_DIR/docker-compose.yml'" <<EOF
services:
  db:
    image: mysql:8.4.8
    container_name: crisisview-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: incident_db
    volumes:
      - crisisview_mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-proot"]
      interval: 10s
      timeout: 5s
      retries: 10

  api:
    image: ${BACKEND_IMAGE}:latest
    container_name: crisisview-api
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DB_NAME: incident_db
      DB_USER: root
      DB_PASSWORD: root
      DB_HOST: db
      DB_PORT: 3306
      PORT: 3001
    ports:
      - "3001:3001"

volumes:
  crisisview_mysql_data:
EOF

                        ssh "$BACKEND_USER@$BACKEND_HOST" "cd '$REMOTE_APP_DIR' && docker compose pull && docker compose up -d"
                        ssh "$BACKEND_USER@$BACKEND_HOST" "cd '$REMOTE_APP_DIR' && docker compose exec -T api node migration.js"

                        if [ "$RUN_SEED" = "true" ]; then
                          ssh "$BACKEND_USER@$BACKEND_HOST" "cd '$REMOTE_APP_DIR' && docker compose exec -T api node seed.js"
                        fi
                    '''
                }
            }
        }

        stage('Verify Staging Backend') {
            steps {
                sh '''
                    for i in $(seq 1 30); do
                      if curl -fsS "http://$BACKEND_HOST:3001/health"; then
                        curl -fsS "http://$BACKEND_HOST:3001/incidents"
                        exit 0
                      fi
                      sleep 2
                    done
                    exit 1
                '''
            }
        }
    }

    post {
        always {
            sh 'docker rm -f "$TEST_DB_CONTAINER" 2>/dev/null || true'
        }
    }
}
