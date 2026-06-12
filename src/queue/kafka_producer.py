import json
from confluent_kafka import Producer
from confluent_kafka.admin import AdminClient, NewTopic
from loguru import logger
from config import settings

class KafkaProducerWrapper:
    """Helper to initialize and interact with the Kafka Producer client."""
    
    def __init__(self):
        self.bootstrap_servers = settings.KAFKA_BOOTSTRAP_SERVERS
        self.producer = None

    def initialize(self):
        """Initializes the producer and verifies connectivity by ensuring topics exist."""
        if self.producer is not None:
            return
        
        logger.info(f"Initializing Kafka Producer to {self.bootstrap_servers}...")
        conf = {
            'bootstrap.servers': self.bootstrap_servers,
            'acks': 'all',
            'linger.ms': 10  # optimization to batch messages and reduce TCP overhead
        }
        
        try:
            self.producer = Producer(conf)
            self._ensure_topics_exist()
            logger.success("Kafka Producer initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize Kafka Producer: {e}")
            raise

    def _ensure_topics_exist(self):
        """Auto-creates the necessary topics if they are missing in the Kafka broker."""
        admin_client = AdminClient({'bootstrap.servers': self.bootstrap_servers})
        topics = ["user-subscriptions", "market-ticks", "security_master_updates"]
        
        try:
            metadata = admin_client.list_topics(timeout=5.0)
            existing_topics = metadata.topics.keys()
            
            new_topics = []
            for topic in topics:
                if topic not in existing_topics:
                    new_topics.append(NewTopic(topic, num_partitions=1, replication_factor=1))
            
            if new_topics:
                fs = admin_client.create_topics(new_topics)
                for topic, f in fs.items():
                    try:
                        f.result()  # blocks until topic is created
                        logger.info(f"Created Kafka topic: {topic}")
                    except Exception as e:
                        logger.error(f"Failed to create topic {topic}: {e}")
        except Exception as e:
            logger.warning(f"Could not verify/create Kafka topics via AdminClient: {e}")

    def delivery_report(self, err, msg):
        """Callback to log result of message delivery."""
        if err is not None:
            logger.error(f"Kafka delivery failed: {err}")
        else:
            logger.debug(f"Kafka delivered message to {msg.topic()} [{msg.partition()}]")

    def publish(self, topic: str, key: str, value: dict):
        """Publishes a JSON payload to a Kafka topic."""
        if self.producer is None:
            self.initialize()
            
        try:
            payload = json.dumps(value).encode('utf-8')
            self.producer.produce(
                topic=topic,
                key=key.encode('utf-8') if key else None,
                value=payload,
                callback=self.delivery_report
            )
            # Serve callbacks
            self.producer.poll(0)
        except Exception as e:
            logger.error(f"Error publishing to topic {topic}: {e}")

    def flush(self, timeout=3.0):
        """Flushes the producer buffer to write all pending messages."""
        if self.producer:
            self.producer.flush(timeout)

# Global producer instance
kafka_producer = KafkaProducerWrapper()
