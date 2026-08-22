#include<iostream>
using namespace std;
int a[1010];
int main()
{
    int n,m;
    cin>>n>>m;
    for(int i=1;i<=m;i++)
    {
        int x;cin>>x;
        a[x]++;
    }
    for(int i=1;i<=n;i++)
    {
        for(int j=1;j<=a[i];j++)
        {
            cout<<i<<" ";
        }
    }
    return 0;
}