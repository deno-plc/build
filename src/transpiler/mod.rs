use std::sync::LazyLock;

use static_assertions::assert_impl_all;
use threadpool::ThreadPool;
use tokio::sync::oneshot::{Receiver, channel};
use transform::{TransformOptions, TransformResult, transform_code};

pub mod transform;

pub struct TransformPool {
    pool: ThreadPool,
}

assert_impl_all!(TransformPool: Send, Sync);

static TRANSFORM_POOL: LazyLock<TransformPool> = LazyLock::new(TransformPool::new);

impl TransformPool {
    fn new() -> Self {
        let pool = threadpool::Builder::new()
            .thread_name("swc_code_transform".into())
            .build();
        Self { pool }
    }

    pub fn get() -> &'static Self {
        &*TRANSFORM_POOL
    }

    pub fn transform(&self, options: TransformOptions) -> TransformTask {
        let (tx, rx) = channel();
        self.pool.execute(|| {
            let result = transform_code(options);
            tx.send(Some(result)).unwrap();
        });

        TransformTask { chan: rx }
    }
}

pub struct TransformTask {
    chan: Receiver<Option<TransformResult>>,
}

assert_impl_all!(TransformTask: Send);

impl TransformTask {
    pub async fn result(self) -> Option<TransformResult> {
        self.chan.await.unwrap()
    }
}
