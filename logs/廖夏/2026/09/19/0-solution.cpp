#include<iostream>
using namespace std;
const int MAXN = 1e5 + 5;
int a[MAXN];

void quick_sort(int l, int r){
    if (l >= r) return; // 空区间，递归终止；当每个子块的长度小于1时自然成立，整个序列排序完成
    // 1. 每次选取一个基准值，分为大于pivot和小于pivot两个部分
    int pivot = a[(l + r) / 2];
    int i = l - 1, j = r + 1; // 配合do-while，实现左闭右闭
    // 2. 将小于pivot和大于pivot的分别放在两边
    int mid; // mid 表示最终指针得到的中点
    while (i < j){
        // 双指针，将两边需要放到对面的swap
        do i++; while (a[i] < pivot); // 无需换就下一个
        do j--; while (a[j] > pivot);
        if (i < j) swap(a[i], a[j]);
    }
    mid = j;
    // 分治：左右分开
    quick_sort(mid + 1, r);
    quick_sort(l, mid);
}

int main(){
    int n;
    cin >> n;
    for (int i = 1; i <= n; i++)
        cin >> a[i];
    quick_sort(1, n);
    cout << a[1];
    for (int i = 2; i <= n;i++)
        cout << " " << a[i];
    return 0;
}